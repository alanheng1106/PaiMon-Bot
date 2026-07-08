const { HfInference } = require('@huggingface/inference');
const { Ollama } = require('ollama');
const { LRUCache } = require('lru-cache');
const fs = require('fs');
const path = require('path');
const { AI: AIConfig } = require('../config');

class AIClient {
    constructor() {
        // Hugging Face Init
        if (!process.env.HF_TOKEN) {
            console.warn('[AI] HF_TOKEN is not set. Image generation features are disabled.');
            this.hf = null;
        } else {
            this.hf = new HfInference(process.env.HF_TOKEN);
        }

        // Initialize Ollama Cloud Client
        if (!process.env.OLLAMA_API_KEY) {
            console.warn('[AI] OLLAMA_API_KEY is not set. Cloud models will not work.');
            this.ollamaClient = null;
        } else {
            this.ollamaClient = new Ollama({
                host: 'https://ollama.com',
                headers: {
                    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`
                }
            });
        }

        this.model = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
        this.visionModel = process.env.OLLAMA_VISION_MODEL || 'llava';
        this.imageModel = process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';

        // Memory Leak Prevention: Use LRU Cache instead of a standard Map
        this.chats = new LRUCache({
            max: AIConfig.MaxChannels,
            ttl: AIConfig.ChatTTL
        });

        this.cacheSize = AIConfig.HistorySize;

        // Dynamic Tool Initialization
        this.tools = [
            {
                type: 'function',
                function: {
                    name: 'get_current_time',
                    description: 'Get the current system date and time.',
                    parameters: {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                }
            }
        ];

        // Only add web search if the API key is configured
        if (process.env.SERPER_API_KEY) {
            this.tools.push({
                type: 'function',
                function: {
                    name: 'web_search',
                    description: 'Search the entire web to find real-time information, news, or facts.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'The search query to look up on Google.'
                            }
                        },
                        required: ['query']
                    }
                }
            });
        } else {
            console.warn('[AI] SERPER_API_KEY is not set. Web search feature is disabled.');
        }
    }

    get ready() {
        return !!this.ollamaClient || !!this.hf;
    }

    get imageReady() {
        return !!this.hf;
    }

    /**
     * Load the system prompt template from disk. Cached after first read.
     * @returns {string} The raw prompt template with {{date}} placeholder.
     */
    _loadPromptTemplate() {
        if (this._promptTemplateCache) return this._promptTemplateCache;
        try {
            const promptPath = path.join(__dirname, '..', 'system-prompt.txt');
            this._promptTemplateCache = fs.readFileSync(promptPath, 'utf8').trim();
        } catch (err) {
            console.error('[AIClient] Failed to load system-prompt.txt, using fallback:', err.message);
            this._promptTemplateCache = '今天是 {{date}}。你是一個有幫助的助手。';
        }
        return this._promptTemplateCache;
    }

    _ensureSession(channelId) {
        const currentDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
        const promptTemplate = this._loadPromptTemplate();
        const systemPrompt = promptTemplate.replace('{{date}}', currentDate);

        if (!this.chats.has(channelId)) {
            this.chats.set(channelId, [{ role: 'system', content: systemPrompt }]);
        } else {
            const history = this.chats.get(channelId);
            if (history[0] && history[0].role === 'system') {
                history[0].content = systemPrompt;
            }
        }
        return this.chats.get(channelId);
    }

    // Shared history pruning to prevent double-counting between passive and active messages
    _pruneHistory(channelId) {
        const history = this.chats.get(channelId);
        if (!history || history.length <= this.cacheSize) return;

        const systemPrompt = history[0];
        let recentHistory = history.slice(-(this.cacheSize - 1));

        // Never start with a tool message (context would be broken)
        while (recentHistory.length > 0 && recentHistory[0].role === 'tool') {
            recentHistory.shift();
        }

        this.chats.set(channelId, [systemPrompt, ...recentHistory]);
    }

    addPassiveContext(channelId, userName, text) {
        // Ignore empty or very short messages (emoji reactions, single words) — they add noise without value
        if (!text || text.trim().length < AIConfig.MinPassiveLength) return;

        let history = this._ensureSession(channelId);

        history.push({
            role: 'user',
            content: `[${userName}] (在旁邊聊天): ${text}`
        });

        this._pruneHistory(channelId);
    }

    async _webSearch(query) {
        const key = process.env.SERPER_API_KEY;
        if (!key) return 'Error: SERPER_API_KEY is not configured in .env.';

        try {
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ q: query })
            });
            const data = await response.json();

            if (!data.organic || data.organic.length === 0) return 'No results found on the web.';

            // Token Optimization: Format top 4 results instead of 8
            return data.organic
                .slice(0, 4)
                .map((item) => `[${item.title}] ${item.snippet}`)
                .join('\n\n');
        } catch (error) {
            return `Search failed: ${error.message}`;
        }
    }

    // Cleanliness: Extracted sanitization logic
    _sanitizeDiscordResponse(text) {
        return text
            .replace(/@everyone/g, 'everyone')
            .replace(/@here/g, 'here')
            .replace(/<@!?&?\d+>/g, (match) => match.replace('@', ''));
    }

    async generateResponse(prompt, channelId = 'default', userName = '使用者', onUpdate = null, images = []) {
        let history = this._ensureSession(channelId);

        const userMessage = {
            role: 'user',
            content: prompt ? `[${userName}]: ${prompt}` : `[${userName}] 發送了一張圖片`
        };

        if (images && images.length > 0) {
            userMessage.images = images;
        }

        history.push(userMessage);
        this._pruneHistory(channelId);
        history = this.chats.get(channelId);

        try {
            let finalReplyText = '';

            // Determine which model to use
            const hasImages = history.some((m) => m.images && m.images.length > 0);
            const currentModel = hasImages ? this.visionModel : this.model;

            // Main loop (handles tool calls dynamically)
            while (true) {
                if (!this.ollamaClient) throw new Error('Ollama Client is not initialized. Missing API Key.');

                const responseStream = await this.ollamaClient.chat({
                    model: currentModel,
                    messages: history,
                    tools: this.tools,
                    stream: true
                });

                let currentContent = '';
                let toolCalls = [];

                // Process the stream chunk by chunk
                for await (const chunk of responseStream) {
                    if (chunk.message.tool_calls) {
                        toolCalls = chunk.message.tool_calls;
                    }

                    if (chunk.message.content) {
                        currentContent += chunk.message.content;

                        // Send the chunk to Discord ONLY if it's not a tool call
                        if (toolCalls.length === 0 && onUpdate) {
                            onUpdate(this._sanitizeDiscordResponse(currentContent));
                        }
                    }
                }

                if (toolCalls && toolCalls.length > 0) {
                    // The AI decided to use a tool
                    history.push({
                        role: 'assistant',
                        content: currentContent,
                        tool_calls: toolCalls
                    });

                    for (const toolCall of toolCalls) {
                        if (toolCall.function.name === 'get_current_time') {
                            const now = new Date().toLocaleString('zh-TW', { hour12: false });
                            history.push({
                                role: 'tool',
                                name: toolCall.function.name,
                                content: `當前系統時間：${now}`
                            });
                        } else if (toolCall.function.name === 'web_search') {
                            const { query } = toolCall.function.arguments;

                            // Let the user know the bot is doing a web search
                            if (onUpdate) onUpdate(`*(🔍 正在搜尋網頁: ${query}...)*`);

                            const searchResult = await this._webSearch(query);
                            history.push({ role: 'tool', name: toolCall.function.name, content: searchResult });
                        }
                    }
                    // The loop restarts here to generate the final text based on the tool results
                } else {
                    // No tools called, generation is complete!
                    finalReplyText = this._sanitizeDiscordResponse(currentContent);
                    history.push({ role: 'assistant', content: finalReplyText });
                    break;
                }
            }

            return finalReplyText;
        } catch (error) {
            console.error('[AIClient] Ollama Error:', error.message);
            this.chats.delete(channelId);
            throw error;
        }
    }

    async generateImage(prompt) {
        if (!this.imageReady) throw new Error('Image Generation is offline: HF_TOKEN missing.');

        try {
            const imageBlob = await this.hf.textToImage({
                model: this.imageModel,
                inputs: prompt
            });
            const arrayBuffer = await imageBlob.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error('[AIClient] Text to Image failed:', error.message);
            throw error;
        }
    }

    async urlToBase64(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        } catch (error) {
            console.error('[AIClient] urlToBase64 failed:', error.message);
            return null;
        }
    }
}

module.exports = AIClient;
