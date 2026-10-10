import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import ILLMProvider from '../src/core/ai/ILLMProvider';
import AIClient from '../src/core/AIClient';
import AIChatSessionManager from '../src/core/ai/AIChatSessionManager';
import ToolRegistry from '../src/core/tools/ToolRegistry';
import RememberFactTool from '../src/core/tools/RememberFactTool';
import ForgetFactTool from '../src/core/tools/ForgetFactTool';
import { UserMemoryStore } from '../src/core/ai/UserMemoryStore';
import MemoryReflector from '../src/core/ai/MemoryReflector';

const TEST_DATA_DIR = path.join(__dirname, '..', 'data-test-integration');
const TEST_FILE = path.join(TEST_DATA_DIR, 'user-memories-integ-test.json');

class TestLLMProvider extends ILLMProvider {
    constructor() {
        super();
        this.chatStreamFn = null;
        this.completionFn = null;
    }

    get ready() {
        return true;
    }

    async *chatStream(options) {
        if (this.chatStreamFn) {
            yield* this.chatStreamFn(options);
        } else {
            yield { content: '收到！本派蒙已經為你解答。' };
        }
    }

    async generateChatCompletion(options) {
        if (this.completionFn) {
            return await this.completionFn(options);
        }
        return {
            message: {
                content: JSON.stringify([
                    { fact: '習慣使用 TypeScript 進行全端開發', category: 'preference' }
                ])
            }
        };
    }
}

describe('AI Memory Dual-Engine System Integration', () => {
    let memoryStore;
    let toolRegistry;
    let sessionManager;
    let mockLLMProvider;
    let aiClient;
    let reflector;

    beforeEach(() => {
        memoryStore = new UserMemoryStore(TEST_DATA_DIR, TEST_FILE, 10, 100);
        memoryStore.data = {};

        toolRegistry = new ToolRegistry();
        toolRegistry.register(new RememberFactTool(memoryStore));
        toolRegistry.register(new ForgetFactTool(memoryStore));

        sessionManager = new AIChatSessionManager({
            promptProvider: {
                getFormattedSystemPrompt: () => '你是派蒙。'
            }
        });

        mockLLMProvider = new TestLLMProvider();

        aiClient = new AIClient({
            llmProvider: mockLLMProvider,
            toolRegistry,
            sessionManager,
            userMemoryStore: memoryStore
        });

        reflector = new MemoryReflector(memoryStore, mockLLMProvider);
    });

    it('injects existing user memories into system prompt when userId is provided', async () => {
        memoryStore.addMemory('u888', '旅行者空', '習慣使用 Next.js 框架', 'preference');

        let capturedRequestMessages = null;
        mockLLMProvider.chatStreamFn = async function* (params) {
            capturedRequestMessages = params.messages;
            yield { content: '你好呀！' };
        };

        await aiClient.generateResponse(
            '你好派蒙',
            'channel-1',
            '旅行者空',
            null,
            [],
            { userId: 'u888' }
        );

        assert.ok(capturedRequestMessages);
        const systemMsg = capturedRequestMessages.find((m) => m.role === 'system');
        assert.ok(systemMsg);
        assert.ok(systemMsg.content.includes('【關於旅行者「旅行者空」的專屬長期記憶（派蒙的小本本）】'));
        assert.ok(systemMsg.content.includes('習慣使用 Next.js 框架'));
    });

    it('allows LLM to explicitly invoke remember_user_fact tool during inference', async () => {
        let toolInvocations = 0;
        mockLLMProvider.chatStreamFn = async function* () {
            if (toolInvocations === 0) {
                toolInvocations++;
                yield {
                    content: '',
                    toolCalls: [
                        {
                            id: 'call_1',
                            type: 'function',
                            function: {
                                name: 'remember_user_fact',
                                arguments: JSON.stringify({
                                    fact: '喜歡吃甜甜花釀雞',
                                    category: 'habit'
                                })
                            }
                        }
                    ]
                };
            } else {
                yield { content: '哼哼，本派蒙已經把旅行者喜歡吃甜甜花釀雞的事牢牢記住啦！' };
            }
        };

        const result = await aiClient.generateResponse(
            '派蒙，記住我最喜歡吃甜甜花釀雞！',
            'channel-tool',
            '旅行者螢',
            null,
            [],
            { userId: 'u999' }
        );

        const replyText = typeof result === 'object' ? result.text : result;
        assert.ok(replyText.includes('牢牢記住'));

        const memories = memoryStore.getMemories('u999');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '喜歡吃甜甜花釀雞');
    });

    it('Engine 2 MemoryReflector extracts and stores new facts after chat turn', async () => {
        mockLLMProvider.chatStreamFn = async function* () {
            yield {
                content: JSON.stringify([
                    { fact: '習慣使用 TypeScript 進行全端開發', category: 'preference' }
                ])
            };
        };

        const userMsg = '我平時都是用 TypeScript 和 Discord.js 寫音樂機器人專案';
        const botReply = '很厲害呢！TypeScript 寫機器人非常穩定！';

        const extracted = await reflector.reflect({
            userId: 'u777',
            userName: '旅行者阿杰',
            userMessage: userMsg,
            assistantReply: botReply
        });

        assert.equal(extracted.length, 1);
        const memories = memoryStore.getMemories('u777');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '習慣使用 TypeScript 進行全端開發');
    });
});
