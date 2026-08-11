const { AI: AIConfig } = require('../config');
const ILLMProvider = require('./ai/ILLMProvider');
const OllamaProvider = require('./ai/OllamaProvider');
const ToolRegistry = require('./tools/ToolRegistry');
const GetCurrentTimeTool = require('./tools/GetCurrentTimeTool');
const WebSearchTool = require('./tools/WebSearchTool');
const FilePromptProvider = require('./ai/FilePromptProvider');
const ImageSynthesisService = require('./ai/ImageSynthesisService');
const AIChatSessionManager = require('./ai/AIChatSessionManager');
const DiscordSanitizer = require('../utils/DiscordSanitizer');

/**
 * AIClient — Core AI service facade for LLM inference, tool execution, and context management.
 * Refactored for clean Strategy Pattern (ILLMProvider), Dependency Injection (DIP), and SRP.
 */
class AIClient {
    #llmProvider;
    #imageService;
    #toolRegistry;
    #sessionManager;
    #model;
    #visionModel;

    constructor(options = {}) {
        const {
            llmProvider = null,
            ollamaClient = null,
            imageService = null,
            toolRegistry = null,
            promptProvider = null,
            sessionManager = null,
            config = AIConfig
        } = options;

        // Image Synthesis Service Init (SRP / DIP)
        this.#imageService = imageService || new ImageSynthesisService({
            hfClient: options.hfClient
        });

        // LLM Provider Strategy Init (OCP / DIP)
        if (llmProvider instanceof ILLMProvider) {
            this.#llmProvider = llmProvider;
        } else if (ollamaClient) {
            this.#llmProvider = new OllamaProvider({ client: ollamaClient });
        } else {
            this.#llmProvider = new OllamaProvider();
        }

        this.#model = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
        this.#visionModel = process.env.OLLAMA_VISION_MODEL || 'llava';

        // Session Manager Init (SRP / DIP)
        const effectivePromptProvider = promptProvider || new FilePromptProvider();
        this.#sessionManager = sessionManager || new AIChatSessionManager({
            promptProvider: effectivePromptProvider,
            config
        });

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

    get llmProvider() {
        return this.#llmProvider;
    }

    get tools() {
        return this.#toolRegistry.getDefinitions();
    }

    get ready() {
        return this.#llmProvider.ready || this.#imageService.ready;
    }

    get imageReady() {
        return this.#imageService.ready;
    }

    get chats() {
        return this.#sessionManager.chats;
    }

    get sessionManager() {
        return this.#sessionManager;
    }

    get imageService() {
        return this.#imageService;
    }

    #ensureSession(channelId) {
        return this.#sessionManager.ensureSession(channelId);
    }

    #pruneHistory(channelId) {
        return this.#sessionManager.pruneHistory(channelId);
    }

    #selectModel(requestMessages) {
        const hasImages = requestMessages.some((m) => m.images && m.images.length > 0);
        return hasImages ? this.#visionModel : this.#model;
    }

    addPassiveContext(channelId, userName, text) {
        return this.#sessionManager.addPassiveContext(channelId, userName, text);
    }

    async generateResponse(prompt, channelId = 'default', userName = '使用者', onUpdate = null, images = []) {
        const sessionHistory = this.#ensureSession(channelId);
        const snapshotLength = sessionHistory.length;

        const userMessage = {
            role: 'user',
            content: prompt ? `[${userName}]: ${prompt}` : `[${userName}] 發送了一張圖片`
        };

        if (images && images.length > 0) {
            userMessage.images = images;
        }

        sessionHistory.push(userMessage);
        this.#pruneHistory(channelId);

        const requestMessages = [...sessionHistory];

        try {
            let finalReplyText = '';
            const MAX_TOOL_ITERATIONS = 5;
            let iterations = 0;

            const currentModel = this.#selectModel(requestMessages);

            while (iterations < MAX_TOOL_ITERATIONS) {
                iterations++;

                const stream = this.#llmProvider.chatStream({
                    model: currentModel,
                    messages: requestMessages,
                    tools: this.tools
                });

                const { currentContent, toolCalls } = await this.#consumeStream(stream, onUpdate);

                if (toolCalls && toolCalls.length > 0) {
                    await this.#executeToolCalls(toolCalls, requestMessages, {
                        currentContent,
                        meta: { onUpdate, channelId, userName }
                    });
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
            console.error('[AIClient] Inference Error:', error.message);
            // Rollback session history to snapshot to prevent corrupt message role sequences
            sessionHistory.splice(snapshotLength);
            throw error;
        }
    }

    async #consumeStream(stream, onUpdate) {
        let currentContent = '';
        let toolCalls = [];

        for await (const chunk of stream) {
            if (chunk.toolCalls) {
                toolCalls = chunk.toolCalls;
            }

            if (chunk.content) {
                currentContent += chunk.content;

                if (toolCalls.length === 0 && onUpdate) {
                    try {
                        await onUpdate(DiscordSanitizer.sanitize(currentContent));
                    } catch (err) {
                        console.warn('[AIClient] onUpdate error:', err.message);
                    }
                }
            }
        }

        return { currentContent, toolCalls };
    }

    async #executeToolCalls(toolCalls, requestMessages, context) {
        requestMessages.push({
            role: 'assistant',
            content: context.currentContent,
            tool_calls: toolCalls
        });

        for (const toolCall of toolCalls) {
            let args = {};
            if (typeof toolCall.function.arguments === 'string') {
                try {
                    args = JSON.parse(toolCall.function.arguments);
                } catch (parseErr) {
                    console.warn(`[AIClient] Failed to parse tool arguments for ${toolCall.function?.name}:`, parseErr.message);
                    args = {};
                }
            } else {
                args = toolCall.function.arguments || {};
            }

            const toolResult = await this.#toolRegistry.execute(
                toolCall.function.name,
                args,
                context.meta
            );

            requestMessages.push({
                role: 'tool',
                name: toolCall.function.name,
                content: toolResult
            });
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
