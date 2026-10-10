import BaseTool, { ToolDefinition } from './BaseTool';
import type UserMemoryStore from '../ai/UserMemoryStore';

export interface ForgetFactArgs {
    query: string;
}

/**
 * ForgetFactTool — Tool strategy allowing PaiMon to remove or forget facts from user long-term memory.
 */
class ForgetFactTool extends BaseTool {
    #memoryStore: UserMemoryStore;

    constructor(memoryStore: UserMemoryStore) {
        super();
        this.#memoryStore = memoryStore;
    }

    get memoryStore(): UserMemoryStore {
        return this.#memoryStore;
    }

    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'forget_user_fact',
                description: '當使用者要求派蒙「忘記...」、「不要記這個」、「刪除關於...的記憶」時調用此工具。',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '想要忘記的記憶關鍵字或描述。'
                        }
                    },
                    required: ['query']
                }
            }
        };
    }

    override async execute(args: ForgetFactArgs, context: any = {}): Promise<string> {
        const query = typeof args?.query === 'string' ? args.query.trim() : '';
        if (!query) {
            return '[錯誤] 請提供想要忘記的記憶內容關鍵字。';
        }

        const userId = context?.userId || context?.authorId || 'default-user';

        const removed = this.#memoryStore.removeMemoryByContent(userId, query);
        if (removed) {
            return `[成功抹除] 派蒙的小本本已刪除與「${query}」相關的記憶！`;
        }
        return `[未找到] 派蒙的小本本裡似乎沒有找到與「${query}」相符的記錄呢。`;
    }
}

export default ForgetFactTool;
