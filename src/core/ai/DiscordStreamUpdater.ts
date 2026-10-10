import type { Message, AttachmentBuilder } from 'discord.js';
import { AI as AIConfig, Emojis } from '../../config';

/**
 * DiscordStreamUpdater — Manages throttled, ordered streaming edits to a Discord message.
 * Fixes Fire-and-Forget async race conditions and prevents 429 Rate Limits.
 */
class DiscordStreamUpdater {
    #message: Message | null;
    #throttleMs: number;
    #lastEditTime: number = 0;
    #pendingContent: string | null = null;
    #isProcessing: boolean = false;
    #timer: NodeJS.Timeout | null = null;
    #flushRetries: number = 0;

    static #MAX_FLUSH_RETRIES: number = 5;

    constructor(message: Message | any, throttleMs: number = AIConfig?.StreamThrottleMs || 2000) {
        this.#message = message;
        this.#throttleMs = throttleMs;
    }

    /**
     * Push new chunk/text state to be updated on Discord.
     */
    async push(content: string): Promise<void> {
        if (!content || !content.trim()) return;
        this.#pendingContent = content;
        this.#scheduleFlush();
    }

    #scheduleFlush(): void {
        if (this.#isProcessing || !this.#pendingContent) return;

        const now = Date.now();
        const elapsed = now - this.#lastEditTime;
        const waitMs = Math.max(0, this.#throttleMs - elapsed);

        this.#isProcessing = true;
        this.#timer = setTimeout(async () => {
            await this.#flush();
        }, waitMs);
    }

    async #flush(): Promise<void> {
        if (!this.#pendingContent || !this.#message) {
            this.#isProcessing = false;
            return;
        }

        const textToEdit = this.#pendingContent;
        this.#pendingContent = null;
        this.#lastEditTime = Date.now();

        let displayContent = textToEdit;
        if (displayContent.length > 1950) {
            displayContent = displayContent.slice(0, 1950) + '...';
        }

        let editFailed = false;
        const suffix = displayContent.includes(Emojis.Loading) ? '' : ` ${Emojis.Loading}`;
        try {
            await this.#message.edit({
                content: `${displayContent}${suffix}`,
                allowedMentions: { parse: [] }
            });
            // Successful edit — reset consecutive error counter
            this.#flushRetries = 0;
        } catch (err: any) {
            console.error('[DiscordStreamUpdater] Edit error:', err.message);
            editFailed = true;
            this.#flushRetries++;
        } finally {
            if (this.#pendingContent && (!editFailed || this.#flushRetries < DiscordStreamUpdater.#MAX_FLUSH_RETRIES)) {
                // More updates queued up while edit was in flight
                const elapsed = Date.now() - this.#lastEditTime;
                const waitMs = Math.max(0, this.#throttleMs - elapsed);
                this.#timer = setTimeout(async () => {
                    await this.#flush();
                }, waitMs);
            } else {
                if (this.#flushRetries >= DiscordStreamUpdater.#MAX_FLUSH_RETRIES) {
                    console.warn(
                        '[DiscordStreamUpdater] Max consecutive edit errors reached, dropping pending update.'
                    );
                    this.#flushRetries = 0;
                }
                this.#isProcessing = false;
            }
        }
    }

    /**
     * Splits long text content cleanly into chunks within Discord's 2000-character boundary.
     * Prefers splitting at double newlines, single newlines, sentences, or spaces.
     * Automatically preserves and re-opens markdown codeblocks across split boundaries.
     */
    static splitMessage(text: string, maxLength: number = 1900): string[] {
        if (!text || text.length <= maxLength) return [text || ''];

        const chunks: string[] = [];
        let remaining = text;
        let openCodeBlockLang: string | null = null;

        while (remaining.length > 0) {
            let prefix = '';
            if (openCodeBlockLang !== null) {
                prefix = `\`\`\`${openCodeBlockLang}\n`;
            }

            const effectiveMax = Math.max(200, maxLength - prefix.length - 10);

            if (remaining.length <= effectiveMax) {
                chunks.push((prefix + remaining).trim());
                break;
            }

            const searchSlice = remaining.slice(0, effectiveMax);

            // 1. Try double newline (paragraph break)
            let splitIndex = searchSlice.lastIndexOf('\n\n');
            if (splitIndex !== -1 && splitIndex >= effectiveMax * 0.3) {
                splitIndex += 2;
            } else {
                // 2. Try single newline
                splitIndex = searchSlice.lastIndexOf('\n');
                if (splitIndex !== -1 && splitIndex >= effectiveMax * 0.3) {
                    splitIndex += 1;
                } else {
                    // 3. Try sentence punctuation
                    const sentenceMatch = searchSlice.match(/([.!?。！？\n])(?=[^\n]*$)/);
                    if (sentenceMatch && sentenceMatch.index && sentenceMatch.index >= effectiveMax * 0.3) {
                        splitIndex = sentenceMatch.index + 1;
                    } else {
                        // 4. Try whitespace
                        splitIndex = searchSlice.lastIndexOf(' ');
                        if (splitIndex !== -1 && splitIndex >= effectiveMax * 0.3) {
                            splitIndex += 1;
                        } else {
                            // Hard split fallback
                            splitIndex = effectiveMax;
                        }
                    }
                }
            }

            const chunkRaw = remaining.slice(0, splitIndex).trim();
            remaining = remaining.slice(splitIndex).trim();

            const combined = prefix + chunkRaw;
            const codeTags = combined.match(/```(\w*)/g) || [];

            let finalChunk = combined;
            if (codeTags.length % 2 !== 0) {
                // An odd number of ``` means a codeblock was opened but not closed
                const lastTag = codeTags[codeTags.length - 1];
                openCodeBlockLang = lastTag.replace(/```/, '').trim();
                finalChunk = `${combined}\n\`\`\``;
            } else {
                openCodeBlockLang = null;
            }

            if (finalChunk.trim()) {
                chunks.push(finalChunk.trim());
            }
        }

        return chunks.length > 0 ? chunks : [text];
    }

    /**
     * Complete streaming and apply final text without typing status indicator.
     * Cancels pending timers, splits oversized responses (>2000 chars), and sends chained follow-up replies.
     */
    async finalize(finalText: string, files: (AttachmentBuilder | any)[] = []): Promise<void> {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        this.#pendingContent = null;
        this.#isProcessing = false;
        this.#flushRetries = 0;

        if (this.#message && finalText) {
            const chunks = DiscordStreamUpdater.splitMessage(finalText, 1900);
            const firstChunk = chunks[0] || finalText;

            const payload: any = {
                content: firstChunk,
                allowedMentions: { parse: [] }
            };
            if (files && files.length > 0) {
                payload.files = files;
            }

            await this.#message
                .edit(payload)
                .catch((err: any) => console.warn('[DiscordStreamUpdater] Finalize edit error:', err.message));

            // Deliver any remaining chunks as sequential replies chained directly without extra notices
            if (chunks.length > 1) {
                let prevMsg: any = this.#message;

                for (let i = 1; i < chunks.length; i++) {
                    const chunkPayload: any = {
                        content: chunks[i],
                        allowedMentions: { parse: [], repliedUser: false }
                    };

                    try {
                        if (typeof prevMsg.reply === 'function') {
                            prevMsg = await prevMsg.reply(chunkPayload);
                        } else if (this.#message.channel && 'send' in this.#message.channel) {
                            prevMsg = await (this.#message.channel as any).send(chunkPayload);
                        }
                    } catch (sendErr: any) {
                        console.warn(`[DiscordStreamUpdater] Follow-up reply error for chunk ${i}:`, sendErr.message);
                    }
                }
            }
        }
    }
}

export default DiscordStreamUpdater;
