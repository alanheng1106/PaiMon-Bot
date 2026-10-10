import BaseTool, { ToolDefinition } from './BaseTool';
import type UserMemoryStore from '../ai/UserMemoryStore';

export interface RememberFactArgs {
    fact: string;
    category?: 'preference' | 'habit' | 'project' | 'profile' | 'other' | string;
}

/**
 * RememberFactTool — Tool strategy allowing PaiMon to explicitly record user facts/preferences into long-term memory.
 */
class RememberFactTool extends BaseTool {
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
                name: 'remember_user_fact',
                description:
                    '當使用者透露關鍵個人特徵、語言/框架偏好、專案背景、習慣或重要事項，或明確要求「派蒙記住...」時，調用此工具將客觀事實記入長期記憶庫（派蒙的小本本）中。嚴禁記錄使用者的 Discord 帳號名稱、稱呼或伺服器暱稱。',
                parameters: {
                    type: 'object',
                    properties: {
                        fact: {
                            type: 'string',
                            description:
                                '客觀、精煉的事實描述。例如：「偏好使用 TypeScript 和 NestJS」、「正在開發 Discord 音樂機器人」。嚴禁記錄使用者的名稱或暱稱。'
                        },
                        category: {
                            type: 'string',
                            enum: ['preference', 'habit', 'project', 'profile', 'other'],
                            description: '事實分類：preference(偏好), habit(習慣), project(專案), profile(個人畫像), other(其他)'
                        }
                    },
                    required: ['fact']
                }
            }
        };
    }

    override async execute(args: RememberFactArgs, context: any = {}): Promise<string> {
        const fact = typeof args?.fact === 'string' ? args.fact.trim() : '';
        if (!fact) {
            return '[錯誤] 無效的事實內容，記憶失敗。';
        }

        const userId = context?.userId || context?.authorId || 'default-user';
        const userName = context?.userName || context?.authorName || '使用者';
        const category = args?.category || 'other';

        const result = this.#memoryStore.addMemory(userId, userName, fact, category);
        if (!result.success) {
            return `[失敗] 無法將記憶寫入小本本。`;
        }

        if (result.isDuplicate) {
            return `[成功更新] 派蒙的小本本已更新旅行者「${userName}」的記憶：「${fact}」。`;
        }

        return `[成功記憶] 派蒙的小本本已牢牢記下旅行者「${userName}」的這件事：「${fact}」！`;
    }
}

export default RememberFactTool;
