import type UserMemoryStore from './UserMemoryStore';
import type ILLMProvider from './ILLMProvider';

export interface ReflectOptions {
    userId: string;
    userName: string;
    userMessage: string;
    assistantReply: string;
    llmProvider?: ILLMProvider | null;
    model?: string;
}

export interface ExtractedFact {
    fact: string;
    category?: 'preference' | 'habit' | 'project' | 'profile' | 'other' | string;
}

/**
 * MemoryReflector — Engine 2: Background asynchronous memory extraction.
 * Extracts persistent facts/preferences from conversations without blocking real-time chat.
 */
export class MemoryReflector {
    #memoryStore: UserMemoryStore;
    #defaultProvider: ILLMProvider | null;
    #defaultModel: string;

    // Fast heuristic keyword triggers to prevent needless LLM calls
    private static readonly PERSONAL_TRIGGERS = [
        /我.{0,6}(?:是|在|有|用|喜歡|偏好|習慣|打算|正在|常|討厭|愛|不喜歡|想要|學過|寫|做|覺得)/i,
        /我的/i,
        /(?:記住|記下|小本本|叫我|稱呼我)/i,
        /(?:專案|習慣|偏好|工作|就讀|大學|職業|身分|生日)/i,
        /\b(?:i am|i'm|i like|i prefer|i hate|my|call me|remember that|working on)\b/i
    ];

    constructor(
        memoryStore: UserMemoryStore,
        defaultProvider: ILLMProvider | null = null,
        defaultModel: string = 'deepseek-v4-pro-thinking'
    ) {
        this.#memoryStore = memoryStore;
        this.#defaultProvider = defaultProvider;
        this.#defaultModel = defaultModel;
    }

    get memoryStore(): UserMemoryStore {
        return this.#memoryStore;
    }

    /**
     * Quickly checks if the user message likely contains personal traits or explicit memory requests.
     */
    shouldReflect(userMessage: string): boolean {
        if (!userMessage || userMessage.trim().length < 4) return false;
        const trimmed = userMessage.trim();

        // Skip code fences or bot slash command invocations
        if (trimmed.startsWith('/') || trimmed.startsWith('```')) return false;

        return MemoryReflector.PERSONAL_TRIGGERS.some((reg) => reg.test(trimmed));
    }

    /**
     * Asynchronously reflects on the completed conversation turn and saves new facts.
     * Guaranteed to never throw or block.
     */
    async reflect(options: ReflectOptions): Promise<ExtractedFact[]> {
        const { userId, userName, userMessage, assistantReply, llmProvider = null, model = null } = options;

        if (!userId || !this.shouldReflect(userMessage)) {
            return [];
        }

        const provider = llmProvider || this.#defaultProvider;
        if (!provider || !provider.ready) {
            return [];
        }

        const activeModel = model || this.#defaultModel;

        try {
            const systemPrompt = [
                '你是一個精準的對話長期記憶提煉引擎。',
                '請分析使用者與對話助手的對話，萃取使用者透露出的【值得長期記憶的個人事實、特徵、習慣、技術偏好、生活喜好或專案背景】。',
                '規則：',
                '1. 只記錄關於「使用者本人」的事實，絕不記錄普遍真理、代碼解答或派蒙自身的資訊。',
                '2. 嚴禁記錄使用者的 Discord 帳號名稱、稱呼、暱稱或身分（系統已內建全域使用者 username，不需亦不應記錄）。',
                '3. 忽略臨時一次性的閒聊或問答（例如「今天天氣如何」、「幫我查資料」沒有個人事實）。',
                '4. 事實必須精練客觀（例如：「習慣使用 TypeScript 和 React」、「正在開發 Discord 音樂機器人」）。',
                '5. 若無任何值得長期保留的新資訊，請直接回傳空陣列 []。',
                '6. 必須嚴格輸出純 JSON 陣列，格式為：[{"fact": "...", "category": "preference|habit|project|profile|other"}]，嚴禁包含額外文字或 markdown 代碼塊！'
            ].join('\n');

            const userPrompt = `使用者 (${userName}): ${userMessage}\n助理回覆: ${assistantReply.slice(0, 300)}`;

            let replyContent = '';

            // Consume standard ILLMProvider.chatStream
            if (typeof provider.chatStream === 'function') {
                const stream = provider.chatStream({
                    model: activeModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    options: {
                        temperature: 0.1,
                        max_tokens: 300
                    }
                });

                for await (const chunk of stream) {
                    if (chunk?.content) {
                        replyContent += chunk.content;
                    }
                }
            }

            replyContent = replyContent.trim();
            const facts = this.parseExtractedFacts(replyContent);

            for (const item of facts) {
                if (item.fact && item.fact.trim()) {
                    this.#memoryStore.addMemory(userId, userName, item.fact.trim(), item.category || 'other');
                }
            }

            return facts;
        } catch (err: any) {
            console.warn('[MemoryReflector] Background reflection error:', err.message);
            return [];
        }
    }

    /**
     * Safely parses JSON output from LLM reflection response.
     */
    parseExtractedFacts(rawText: string): ExtractedFact[] {
        if (!rawText) return [];

        let cleaned = rawText.trim();
        // Remove code block markdown if present
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
                return parsed.filter((item) => item && typeof item.fact === 'string' && item.fact.trim().length > 0);
            }
            return [];
        } catch {
            return [];
        }
    }
}

export default MemoryReflector;
