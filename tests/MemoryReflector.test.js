import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { UserMemoryStore } from '../src/core/ai/UserMemoryStore';
import MemoryReflector from '../src/core/ai/MemoryReflector';

const TEST_DATA_DIR = path.join(__dirname, '..', 'data-test-reflector');
const TEST_FILE = path.join(TEST_DATA_DIR, 'user-memories-reflector-test.json');

describe('MemoryReflector', () => {
    let store;
    let reflector;

    beforeEach(() => {
        store = new UserMemoryStore(TEST_DATA_DIR, TEST_FILE, 10, 100);
        store.data = {};
        reflector = new MemoryReflector(store);
    });

    afterEach(() => {
        if (store?._debounceTimer) clearTimeout(store._debounceTimer);
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    });

    it('heuristically filters trivial messages', () => {
        assert.equal(reflector.shouldReflect('今天天氣如何？'), false);
        assert.equal(reflector.shouldReflect('/play song_name'), false);
        assert.equal(reflector.shouldReflect('1+1等於多少'), false);
        assert.equal(reflector.shouldReflect('你好'), false);

        assert.equal(reflector.shouldReflect('我平時都用 TypeScript 寫前端'), true);
        assert.equal(reflector.shouldReflect('我的專案正在使用 NestJS'), true);
        assert.equal(reflector.shouldReflect('派蒙請記住我叫旅行者'), true);
        assert.equal(reflector.shouldReflect('我不喜歡吃青椒'), true);
    });

    it('safely parses JSON and Markdown-wrapped JSON responses', () => {
        const jsonOnly = '[{"fact": "習慣使用 Vim", "category": "habit"}]';
        assert.deepEqual(reflector.parseExtractedFacts(jsonOnly), [
            { fact: '習慣使用 Vim', category: 'habit' }
        ]);

        const markdownWrapped = '```json\n[{"fact": "正在開發機器人", "category": "project"}]\n```';
        assert.deepEqual(reflector.parseExtractedFacts(markdownWrapped), [
            { fact: '正在開發機器人', category: 'project' }
        ]);

        const emptyArray = '[]';
        assert.deepEqual(reflector.parseExtractedFacts(emptyArray), []);

        const brokenJson = 'not a json';
        assert.deepEqual(reflector.parseExtractedFacts(brokenJson), []);
    });

    it('asynchronously extracts facts using mock LLM and saves to store', async () => {
        const mockProvider = {
            ready: true,
            chatStream: async function* () {
                yield {
                    content: JSON.stringify([
                        { fact: '使用者偏好使用 TypeScript', category: 'preference' },
                        { fact: '正在開發 Discord 機器人', category: 'project' }
                    ])
                };
            }
        };

        const facts = await reflector.reflect({
            userId: 'user-789',
            userName: '旅行者阿杰',
            userMessage: '我平時都是用 TypeScript 寫 Discord 機器人',
            assistantReply: '太棒了！TypeScript 很有型別安全優勢！',
            llmProvider: mockProvider
        });

        assert.equal(facts.length, 2);

        const memories = store.getMemories('user-789');
        assert.equal(memories.length, 2);
        assert.equal(memories[0].content, '使用者偏好使用 TypeScript');
        assert.equal(memories[1].content, '正在開發 Discord 機器人');
    });

    it('handles LLM provider error gracefully without throwing', async () => {
        const errorProvider = {
            ready: true,
            chatStream: async function* () {
                throw new Error('LLM Gateway 500 Network Timeout');
            }
        };

        const facts = await reflector.reflect({
            userId: 'user-789',
            userName: '旅行者阿杰',
            userMessage: '我討厭吃胡蘿蔔',
            assistantReply: '派蒙也是！胡蘿蔔最討厭了！',
            llmProvider: errorProvider
        });

        assert.deepEqual(facts, []);
        assert.deepEqual(store.getMemories('user-789'), []);
    });

    it('filters out extracted facts attempting to store user name or nicknames', async () => {
        const mockProvider = {
            ready: true,
            chatStream: async function* () {
                yield {
                    content: JSON.stringify([
                        { fact: '稱呼為小明', category: 'profile' },
                        { fact: '習慣使用 Go 語言', category: 'preference' }
                    ])
                };
            }
        };

        const facts = await reflector.reflect({
            userId: 'user-789',
            userName: 'global_user',
            userMessage: '我習慣用 Go 語言寫後端',
            assistantReply: 'Go 語言效能非常好！',
            llmProvider: mockProvider
        });

        assert.equal(facts.length, 2);
        const memories = store.getMemories('user-789');
        // '稱呼為小明' is rejected by store guard, only Go fact is stored
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '習慣使用 Go 語言');
    });
});
