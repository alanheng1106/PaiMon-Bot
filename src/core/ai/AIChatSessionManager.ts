import { LRUCache } from 'lru-cache';
import { AI as AIConfig } from '../../config';
import FilePromptProvider from './FilePromptProvider';

export interface AIChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool' | string;
    content: string;
    tool_calls?: any[];
    [key: string]: any;
}

export interface AIChatSessionManagerOptions {
    promptProvider?: FilePromptProvider | null;
    config?: typeof AIConfig;
}

/**
 * AIChatSessionManager — Manages LRU-cached channel conversation histories and system prompt formatting.
 * Refactored for Single Responsibility Principle (SRP).
 */
class AIChatSessionManager {
    #chats: LRUCache<string, AIChatMessage[]>;
    #historySize: number;
    #promptProvider: FilePromptProvider;

    constructor(options: AIChatSessionManagerOptions = {}) {
        const { promptProvider = null, config = AIConfig } = options;

        this.#chats = new LRUCache<string, AIChatMessage[]>({
            max: config.MaxChannels || AIConfig.MaxChannels,
            ttl: config.ChatTTL || AIConfig.ChatTTL
        });
        this.#historySize = config.HistorySize || AIConfig.HistorySize;
        this.#promptProvider = promptProvider || new FilePromptProvider();
    }

    get chats(): LRUCache<string, AIChatMessage[]> {
        return this.#chats;
    }

    get historySize(): number {
        return this.#historySize;
    }

    get promptProvider(): FilePromptProvider {
        return this.#promptProvider;
    }

    /**
     * Ensure session array exists for channel with active system prompt.
     */
    ensureSession(channelId: string): AIChatMessage[] {
        const systemPrompt = this.#promptProvider.getFormattedSystemPrompt();

        if (!this.#chats.has(channelId)) {
            this.#chats.set(channelId, [{ role: 'system', content: systemPrompt }]);
        } else {
            const history = this.#chats.get(channelId);
            if (history && history[0] && history[0].role === 'system') {
                history[0].content = systemPrompt;
            }
        }
        return this.#chats.get(channelId)!;
    }

    /**
     * Prune chat session history to prevent exceeding maximum context length.
     */
    pruneHistory(channelId: string): void {
        const history = this.#chats.get(channelId);
        if (!history || history.length <= this.#historySize) return;

        // In-place mutate history array so active references in AIClient remain valid
        const removeCount = history.length - this.#historySize;
        history.splice(1, removeCount);

        // Ensure history after system prompt does not start with a dangling tool message
        while (history.length > 1 && history[1].role === 'tool') {
            history.splice(1, 1);
        }
    }

    /**
     * Add passive context from nearby channel messages.
     */
    addPassiveContext(channelId: string, userName: string, text: string): void {
        if (!text || text.trim().length < AIConfig.MinPassiveLength) return;

        const history = this.ensureSession(channelId);

        history.push({
            role: 'user',
            content: `[頻道背景閒聊記錄（成員間對話，非向派蒙提問，無需回覆）] [${userName}]: ${text}`
        });

        // Add an explicit bystander assistant placeholder to maintain valid role alternation
        // and clearly signal to LLM that this was bystander chatter requiring no follow-up answer.
        history.push({
            role: 'assistant',
            content: '（派蒙在一旁安靜聽著成員間的閒聊，未被呼叫不插話）'
        });

        this.pruneHistory(channelId);
    }

    /**
     * Clear / reset chat session history for a channel.
     */
    clearSession(channelId: string): boolean {
        return this.#chats.delete(channelId);
    }
}

export default AIChatSessionManager;
