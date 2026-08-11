const { AI: AIConfig } = require('../../config');

/**
 * DiscordStreamUpdater — Manages throttled, ordered streaming edits to a Discord message.
 * Fixes Fire-and-Forget async race conditions and prevents 429 Rate Limits.
 */
class DiscordStreamUpdater {
    #message;
    #throttleMs;
    #lastEditTime = 0;
    #pendingContent = null;
    #isProcessing = false;
    #timer = null;

    /**
     * @param {import('discord.js').Message} message 
     * @param {number} [throttleMs] Minimum delay between Discord API edit calls
     */
    constructor(message, throttleMs = AIConfig?.StreamThrottleMs || 2000) {
        this.#message = message;
        this.#throttleMs = throttleMs;
    }

    /**
     * Push new chunk/text state to be updated on Discord.
     * @param {string} content 
     */
    async push(content) {
        if (!content || !content.trim()) return;
        this.#pendingContent = content;
        this.#scheduleFlush();
    }

    #scheduleFlush() {
        if (this.#isProcessing || !this.#pendingContent) return;

        const now = Date.now();
        const elapsed = now - this.#lastEditTime;
        const waitMs = Math.max(0, this.#throttleMs - elapsed);

        this.#isProcessing = true;
        this.#timer = setTimeout(async () => {
            await this.#flush();
        }, waitMs);
    }

    async #flush() {
        if (!this.#pendingContent || !this.#message) {
            this.#isProcessing = false;
            return;
        }

        const textToEdit = this.#pendingContent;
        this.#pendingContent = null;
        this.#lastEditTime = Date.now();

        try {
            await this.#message.edit({
                content: `${textToEdit} ✍️`,
                allowedMentions: { parse: [] }
            });
        } catch (err) {
            console.error('[DiscordStreamUpdater] Edit error:', err.message);
        } finally {
            if (this.#pendingContent) {
                // More updates queued up while edit was in flight
                const elapsed = Date.now() - this.#lastEditTime;
                const waitMs = Math.max(0, this.#throttleMs - elapsed);
                this.#timer = setTimeout(async () => {
                    await this.#flush();
                }, waitMs);
            } else {
                this.#isProcessing = false;
            }
        }
    }

    /**
     * Complete streaming and apply final text without typing status indicator.
     * Cancels pending timers and awaits final edit promise.
     * @param {string} finalText 
     */
    async finalize(finalText) {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        this.#pendingContent = null;
        this.#isProcessing = false;

        if (this.#message && finalText) {
            await this.#message.edit({
                content: finalText,
                allowedMentions: { parse: [] }
            }).catch((err) => console.warn('[DiscordStreamUpdater] Finalize edit error:', err.message));
        }
    }
}

module.exports = DiscordStreamUpdater;
