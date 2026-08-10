const { Ollama } = require('ollama');
const { LRUCache } = require('lru-cache');
const { AI: AIConfig } = require('../config');
const ToolRegistry = require('./tools/ToolRegistry');
const GetCurrentTimeTool = require('./tools/GetCurrentTimeTool');
const WebSearchTool = require('./tools/WebSearchTool');
const FilePromptProvider = require('./ai/FilePromptProvider');
const ImageSynthesisService = require('./ai/ImageSynthesisService');
const DiscordSanitizer = require('../utils/DiscordSanitizer');

/**
 * AIClient — Core AI service for LLM inference, tool execution, and context management.
 * Refactored for clean Dependency Injection (DIP), SRP, and Encapsulation (#).
 */
class AIClient {
    #ollamaClient;
    #imageService;
    #toolRegistry;
    #promptProvider;
    #chats;
    #historySize;
    #model;
    #visionModel;

    constructor(options = {}) {
        const {
            ollamaClient = null,
            imageService = null,
            toolRegistry = null,
            promptProvider = null,
            config = AIConfig
        } = options;

        // Image Synthesis Service Init (SRP / DIP)
        this.#imageService = imageService || new ImageSynthesisService({
            hfClient: options.hfClient
        });

        // Ollama Client Init
        if (ollamaClient) {
            this.#ollamaClient = ollamaClient;
        } else if (process.env.OLLAMA_API_KEY) {
            this.#ollamaClient = new Ollama({
                host: 'https://ollama.com',
                headers: {
                    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`
                }
            });
        } else {
            console.warn('[AI] OLLAMA_API_KEY is not set. Cloud models will not work.');
            this.#ollamaClient = null;
        }

        this.#model = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
        this.#visionModel = process.env.OLLAMA_VISION_MODEL || 'llava';

        // Memory Leak Prevention: LRU Cache
        this.#chats = new LRUCache({
            max: config.MaxChannels || AIConfig.MaxChannels,
            ttl: config.ChatTTL || AIConfig.ChatTTL
        });
        this.#historySize = config.HistorySize || AIConfig.HistorySize;

        // Prompt Provider Init (DIP)
        this.#promptProvider = promptProvider || new FilePromptProvider();

        // ToolRegistry Init (DIP)
        if (toolRegistry) {
            this.#toolRegistry = toolRegistry;
        } else {
            this.#toolRegistry = new ToolRegistry();
            this.#toolRegistry.register(new GetCurrentTimeTool());
            if (process.env.SERPER_API_KEY) {
                this.#toolRegistry.register(new WebSearchTool());
            } else {
                console.warn('[AI] SERPER_API_KEY is not set. Web search feature is disabled.');
            }
        }
    }

    get tools() {
        return this.#toolRegistry.getDefinitions();
    }

    get ready() {
        return !!this.#ollamaClient || this.#imageService.ready;
    }

    get imageReady() {
        return this.#imageService.ready;
    }

    get chats() {
        return this.#chats;
    }

    get imageService() {
        return this.#imageService;
    }

    _ensureSession(channelId) {
        const systemPrompt = this.#promptProvider.getFormattedSystemPrompt();

        if (!this.#chats.has(channelId)) {
            this.#chats.set(channelId, [{ role: 'system', content: systemPrompt }]);
        } else {
            const history = this.#chats.get(channelId);
            if (history[0] && history[0].role === 'system') {
                history[0].content = systemPrompt;
            }
        }
        return this.#chats.get(channelId);
    }

    _pruneHistory(channelId) {
        const history = this.#chats.get(channelId);
        if (!history || history.length <= this.#historySize) return;

        const systemPrompt = history[0];
        let recentHistory = history.slice(-(this.#historySize - 1));

        while (recentHistory.length > 0 && recentHistory[0].role === 'tool') {
            recentHistory.shift();
        }

        this.#chats.set(channelId, [systemPrompt, ...recentHistory]);
    }

    addPassiveContext(channelId, userName, text) {
        if (!text || text.trim().length < AIConfig.MinPassiveLength) return;

        let history = this._ensureSession(channelId);

        history.push({
            role: 'user',
            content: `[${userName}] (在旁邊聊天): ${text}`
        });

        this._pruneHistory(channelId);
    }

    async generateResponse(prompt, channelId = 'default', userName = '使用者', onUpdate = null, images = []) {
        const sessionHistory = this._ensureSession(channelId);

        const userMessage = {
            role: 'user',
            content: prompt ? `[${userName}]: ${prompt}` : `[${userName}] 發送了一張圖片`
        };

        if (images && images.length > 0) {
            userMessage.images = images;
        }

        sessionHistory.push(userMessage);
        this._pruneHistory(channelId);

        const requestMessages = [...sessionHistory];

        try {
            let finalReplyText = '';
            const MAX_TOOL_ITERATIONS = 5;
            let iterations = 0;

            const hasImages = requestMessages.some((m) => m.images && m.images.length > 0);
            const currentModel = hasImages ? this.#visionModel : this.#model;

            while (iterations < MAX_TOOL_ITERATIONS) {
                iterations++;

                if (!this.#ollamaClient) throw new Error('Ollama Client is not initialized. Missing API Key.');

                const responseStream = await this.#ollamaClient.chat({
                    model: currentModel,
                    messages: requestMessages,
                    tools: this.tools,
                    stream: true
                });

                let currentContent = '';
                let toolCalls = [];

                for await (const chunk of responseStream) {
                    if (chunk.message.tool_calls) {
                        toolCalls = chunk.message.tool_calls;
                    }

                    if (chunk.message.content) {
                        currentContent += chunk.message.content;

                        if (toolCalls.length === 0 && onUpdate) {
                            onUpdate(DiscordSanitizer.sanitize(currentContent));
                        }
                    }
                }

                if (toolCalls && toolCalls.length > 0) {
                    requestMessages.push({
                        role: 'assistant',
                        content: currentContent,
                        tool_calls: toolCalls
                    });

                    for (const toolCall of toolCalls) {
                        const args = typeof toolCall.function.arguments === 'string'
                            ? JSON.parse(toolCall.function.arguments)
                            : toolCall.function.arguments || {};

                        const toolResult = await this.#toolRegistry.execute(
                            toolCall.function.name,
                            args,
                            { onUpdate, channelId, userName }
                        );

                        requestMessages.push({
                            role: 'tool',
                            name: toolCall.function.name,
                            content: toolResult
                        });
                    }
                } else {
                    finalReplyText = DiscordSanitizer.sanitize(currentContent);
                    sessionHistory.push({ role: 'assistant', content: finalReplyText });
                    break;
                }
            }

            if (iterations >= MAX_TOOL_ITERATIONS && !finalReplyText) {
                throw new Error('[AIClient] Reached maximum tool execution limit (5 iterations).');
            }

            return finalReplyText;
        } catch (error) {
            console.error('[AIClient] Ollama Error:', error.message);
            this.#chats.delete(channelId);
            throw error;
        }
    }

    async generateImage(prompt) {
        return await this.#imageService.generateImage(prompt);
    }

    async urlToBase64(url) {
        return await this.#imageService.urlToBase64(url);
    }
}

module.exports = AIClient;
