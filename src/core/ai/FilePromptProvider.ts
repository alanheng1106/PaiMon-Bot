import fs from 'fs';
import path from 'path';

/**
 * FilePromptProvider — Encapsulates loading and caching system prompt templates from disk.
 * Follows Single Responsibility Principle (SRP).
 */
class FilePromptProvider {
    #filePath: string;
    #cachedPrompt: string | null = null;
    #lastMtime: number = 0;

    constructor(filePath: string = path.join(__dirname, '..', '..', 'system-prompt.txt')) {
        this.#filePath = filePath;
    }

    /**
     * Get system prompt template string. Auto-reloads when file is modified.
     */
    getSystemPromptTemplate(): string {
        try {
            const stats = fs.statSync(this.#filePath);
            if (!this.#cachedPrompt || stats.mtimeMs > this.#lastMtime) {
                this.#cachedPrompt = fs.readFileSync(this.#filePath, 'utf8').trim();
                this.#lastMtime = stats.mtimeMs;
            }
        } catch (err: any) {
            if (!this.#cachedPrompt) {
                console.error('[FilePromptProvider] Failed to load system prompt file, using fallback:', err.message);
                this.#cachedPrompt = '今天是 {{date}}. 你是一個有幫助的助手.';
            }
        }
        return this.#cachedPrompt;
    }

    /**
     * Get system prompt formatted with current date, time, and datetime.
     */
    getFormattedSystemPrompt(now: Date = new Date()): string {
        const currentDate = now.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        const currentTime = now.toLocaleTimeString('zh-TW', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDateTime = `${year}-${month}-${day} ${currentTime}`;

        let template = this.getSystemPromptTemplate();
        template = template.replace(/\{\{date\}\}/g, currentDate);
        template = template.replace(/\{\{time\}\}/g, currentTime);
        template = template.replace(/\{\{datetime\}\}/g, currentDateTime);
        return template;
    }
}

export default FilePromptProvider;
