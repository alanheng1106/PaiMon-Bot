const fs = require('fs');
const path = require('path');

/**
 * FilePromptProvider — Encapsulates loading and caching system prompt templates from disk.
 * Follows Single Responsibility Principle (SRP).
 */
class FilePromptProvider {
    #filePath;
    #cachedPrompt = null;

    constructor(filePath = path.join(__dirname, '..', '..', 'system-prompt.txt')) {
        this.#filePath = filePath;
    }

    /**
     * Get system prompt template string.
     * @returns {string}
     */
    getSystemPromptTemplate() {
        if (this.#cachedPrompt) return this.#cachedPrompt;
        try {
            this.#cachedPrompt = fs.readFileSync(this.#filePath, 'utf8').trim();
        } catch (err) {
            console.error('[FilePromptProvider] Failed to load system prompt file, using fallback:', err.message);
            this.#cachedPrompt = '今天是 {{date}}. 你是一個有幫助的助手.';
        }
        return this.#cachedPrompt;
    }

    /**
     * Get system prompt formatted with current date.
     * @returns {string}
     */
    getFormattedSystemPrompt() {
        const currentDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
        const template = this.getSystemPromptTemplate();
        return template.replace('{{date}}', currentDate);
    }
}

module.exports = FilePromptProvider;
