const { Ollama } = require('ollama');
const ILLMProvider = require('./ILLMProvider');
const { AI: AIConfig } = require('../../config');

/**
 * OllamaProvider — Concrete LLM Strategy implementation for Ollama API / Cloud.
 */
class OllamaProvider extends ILLMProvider {
    #client = null;

    /**
     * @param {Object} [options]
     * @param {Ollama} [options.client] Pre-configured Ollama client instance
     */
    constructor(options = {}) {
        super();
        if (options.client) {
            this.#client = options.client;
        } else if (process.env.OLLAMA_API_KEY) {
            this.#client = new Ollama({
                host: process.env.OLLAMA_HOST || AIConfig?.DefaultHost || 'https://ollama.com',
                headers: {
                    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`
                }
            });
        } else {
            console.warn('[AI] OLLAMA_API_KEY is not set. Cloud models will not work.');
            this.#client = null;
        }
    }

    get ready() {
        return !!this.#client;
    }

    get client() {
        return this.#client;
    }

    async *chatStream({ model, messages, tools }) {
        if (!this.#client) {
            throw new Error('Ollama Client is not initialized. Missing API Key.');
        }

        const responseStream = await this.#client.chat({
            model,
            messages,
            tools,
            stream: true
        });

        for await (const chunk of responseStream) {
            yield {
                content: chunk.message?.content || '',
                toolCalls: chunk.message?.tool_calls || null
            };
        }
    }
}

module.exports = OllamaProvider;
