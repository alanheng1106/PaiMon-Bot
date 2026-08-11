const { LRUCache } = require('lru-cache');
const { AI: AIConfig } = require('../../config');
const FilePromptProvider = require('./FilePromptProvider');

/**
 * AIChatSessionManager — Manages LRU-cached channel conversation histories and system prompt formatting.
 * Refactored for Single Responsibility Principle (SRP).
 */
class AIChatSessionManager {
    #chats;
    #historySize;
    #promptProvider;

    /**
     * @param {Object} [options]
     * @param {FilePromptProvider} [options.promptProvider]
     * @param {Object} [options.config]
     */
    constructor(options = {}) {
        const { promptProvider = null, config = AIConfig } = options;

        this.#chats = new LRUCache({
            max: config.MaxChannels || AIConfig.MaxChannels,
            ttl: config.ChatTTL || AIConfig.ChatTTL
        });
        this.#historySize = config.HistorySize || AIConfig.HistorySize;
        this.#promptProvider = promptProvider || new FilePromptProvider();
    }

    get chats() {
        return this.#chats;
    }

    get historySize() {
        return this.#historySize;
    }

    get promptProvider() {
        return this.#promptProvider;
    }

    /**
     * Ensure session array exists for channel with active system prompt.
     * @param {string} channelId 
     * @returns {Array<Object>}
     */
    ensureSession(channelId) {
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

    /**
     * Prune chat session history to prevent exceeding maximum context length.
     * @param {string} channelId 
     */
    pruneHistory(channelId) {
        const history = this.#chats.get(channelId);
        if (!history || history.length <= this.#historySize) return;

        const systemPrompt = history[0];
        let recentHistory = history.slice(-(this.#historySize - 1));

        while (recentHistory.length > 0 && recentHistory[0].role === 'tool') {
            recentHistory.shift();
        }

        this.#chats.set(channelId, [systemPrompt, ...recentHistory]);
    }

    /**
     * Add passive context from nearby channel messages.
     * @param {string} channelId 
     * @param {string} userName 
     * @param {string} text 
     */
    addPassiveContext(channelId, userName, text) {
        if (!text || text.trim().length < AIConfig.MinPassiveLength) return;

        let history = this.ensureSession(channelId);

        history.push({
            role: 'user',
            content: `[${userName}] (在旁邊聊天): ${text}`
        });

        this.pruneHistory(channelId);
    }
}

module.exports = AIChatSessionManager;
