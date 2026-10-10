import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { UserMemoryStore } from '../src/core/ai/UserMemoryStore';

const TEST_DATA_DIR = path.join(__dirname, '..', 'data-test-memory');
const TEST_FILE = path.join(TEST_DATA_DIR, 'user-memories-test.json');

describe('UserMemoryStore', () => {
    let store;

    beforeEach(() => {
        store = new UserMemoryStore(TEST_DATA_DIR, TEST_FILE, 5, 50);
        store.data = {};
    });

    afterEach(() => {
        if (store._debounceTimer) clearTimeout(store._debounceTimer);
        try {
            if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
            if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR);
        } catch {
            // ignore
        }
    });

    it('returns empty array when user has no memories', () => {
        const memories = store.getMemories('user-1');
        assert.deepEqual(memories, []);
        assert.equal(store.formatMemoriesForPrompt('user-1'), '');
    });

    it('adds new memory successfully', () => {
        const res = store.addMemory('user-1', '旅行者A', '喜歡使用 TypeScript', 'preference');
        assert.equal(res.success, true);
        assert.equal(res.isDuplicate, false);
        assert.equal(res.memory.content, '喜歡使用 TypeScript');
        assert.equal(res.memory.category, 'preference');

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '喜歡使用 TypeScript');

        const promptText = store.formatMemoriesForPrompt('user-1');
        assert.ok(promptText.includes('旅行者A'));
        assert.ok(promptText.includes('喜歡使用 TypeScript'));
    });

    it('deduplicates and updates similar memories', () => {
        store.addMemory('user-1', '旅行者A', '喜歡使用 TypeScript 語言', 'preference');
        const res2 = store.addMemory('user-1', '旅行者A', '喜歡使用 TypeScript', 'preference');

        assert.equal(res2.success, true);
        assert.equal(res2.isDuplicate, true);

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '喜歡使用 TypeScript');
    });

    it('caps maximum memories per user by dropping oldest', () => {
        for (let i = 1; i <= 7; i++) {
            store.addMemory('user-1', '旅行者', `記憶項目 ${i}`, 'other');
        }

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 5); // max cap is 5
        assert.equal(memories[0].content, '記憶項目 3');
        assert.equal(memories[4].content, '記憶項目 7');
    });

    it('removes memory by id', () => {
        const { memory } = store.addMemory('user-1', '旅行者', '測試項目 1');
        store.addMemory('user-1', '旅行者', '測試項目 2');

        const removed = store.removeMemory('user-1', memory.id);
        assert.equal(removed, true);

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '測試項目 2');
    });

    it('removes memory by content query', () => {
        store.addMemory('user-1', '旅行者', '我討厭胡蘿蔔');
        store.addMemory('user-1', '旅行者', '我喜歡吃甜甜花釀雞');

        const removed = store.removeMemoryByContent('user-1', '胡蘿蔔');
        assert.equal(removed, true);

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '我喜歡吃甜甜花釀雞');
    });

    it('clears all memories for user', () => {
        store.addMemory('user-1', '旅行者', '項目 A');
        store.addMemory('user-2', '旅行者B', '項目 B');

        store.clearMemories('user-1');

        assert.deepEqual(store.getMemories('user-1'), []);
        assert.equal(store.getMemories('user-2').length, 1);
    });

    it('flushes data to disk properly', () => {
        store.addMemory('user-1', '旅行者', '持久化測試');
        store.flush();

        assert.ok(fs.existsSync(TEST_FILE));
        const raw = fs.readFileSync(TEST_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        assert.ok(parsed['user-1']);
        assert.equal(parsed['user-1'].memories[0].content, '持久化測試');
    });

    it('rejects pure name or nickname facts from being added to memories', () => {
        const res1 = store.addMemory('user-1', 'global_duck', '稱呼為小明', 'profile');
        assert.equal(res1.success, false);

        const res2 = store.addMemory('user-1', 'global_duck', '暱稱是帥哥', 'profile');
        assert.equal(res2.success, false);

        const res3 = store.addMemory('user-1', 'global_duck', '在伺服器暱稱為小帥', 'profile');
        assert.equal(res3.success, false);

        const memories = store.getMemories('user-1');
        assert.equal(memories.length, 0);

        // Normal facts are still added cleanly
        const resNormal = store.addMemory('user-1', 'global_duck', '喜歡使用 Python', 'preference');
        assert.equal(resNormal.success, true);
        assert.equal(store.getMemories('user-1').length, 1);
    });

    it('cleans legacy name/nickname memories across profiles', () => {
        // Manually inject legacy memories
        store.data['u-legacy'] = {
            userId: 'u-legacy',
            userName: 'duck_user',
            memories: [
                { id: '1', content: '稱呼為小明', category: 'profile', createdAt: 1, updatedAt: 1 },
                { id: '2', content: '喜歡用 TypeScript 開發', category: 'preference', createdAt: 2, updatedAt: 2 },
                { id: '3', content: '在伺服器叫大帥哥', category: 'profile', createdAt: 3, updatedAt: 3 }
            ],
            updatedAt: 3
        };

        const cleanedCount = store.cleanLegacyNameMemories();
        assert.equal(cleanedCount, 2);

        const remaining = store.getMemories('u-legacy');
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].content, '喜歡用 TypeScript 開發');
    });
});
