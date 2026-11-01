import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { UserMemoryStore } from '../src/core/ai/UserMemoryStore';
import RememberFactTool from '../src/core/tools/RememberFactTool';
import ForgetFactTool from '../src/core/tools/ForgetFactTool';

const TEST_DATA_DIR = path.join(__dirname, '..', 'data-test-tools');
const TEST_FILE = path.join(TEST_DATA_DIR, 'user-memories-tool-test.json');

describe('RememberFactTool & ForgetFactTool', () => {
    let store;
    let rememberTool;
    let forgetTool;

    beforeEach(() => {
        store = new UserMemoryStore(TEST_DATA_DIR, TEST_FILE, 10, 100);
        store.data = {};
        rememberTool = new RememberFactTool(store);
        forgetTool = new ForgetFactTool(store);
    });

    afterEach(() => {
        if (store?._debounceTimer) clearTimeout(store._debounceTimer);
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    });

    it('has valid tool definitions for function calling', () => {
        assert.equal(rememberTool.definition.type, 'function');
        assert.equal(rememberTool.definition.function.name, 'remember_user_fact');
        assert.ok(rememberTool.definition.function.parameters.properties.fact);

        assert.equal(forgetTool.definition.type, 'function');
        assert.equal(forgetTool.definition.function.name, 'forget_user_fact');
        assert.ok(forgetTool.definition.function.parameters.properties.query);
    });

    it('executes remember_user_fact and saves memory with context', async () => {
        const result = await rememberTool.execute(
            { fact: '習慣使用 TypeScript 和 Next.js 開發', category: 'preference' },
            { userId: 'u123', userName: '小明' }
        );

        assert.ok(result.includes('成功記憶'));
        assert.ok(result.includes('小明'));

        const memories = store.getMemories('u123');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '習慣使用 TypeScript 和 Next.js 開發');
        assert.equal(memories[0].category, 'preference');
    });

    it('handles duplicate memories smoothly', async () => {
        await rememberTool.execute(
            { fact: '習慣使用 TypeScript 開發', category: 'preference' },
            { userId: 'u123', userName: '小明' }
        );

        const result2 = await rememberTool.execute(
            { fact: '習慣使用 TypeScript 開發', category: 'preference' },
            { userId: 'u123', userName: '小明' }
        );

        assert.ok(result2.includes('成功更新'));
        assert.equal(store.getMemories('u123').length, 1);
    });

    it('executes forget_user_fact to remove existing memory', async () => {
        store.addMemory('u123', '小明', '不喜歡吃番茄');
        store.addMemory('u123', '小明', '喜歡吃甜甜花釀雞');

        const result = await forgetTool.execute({ query: '番茄' }, { userId: 'u123', userName: '小明' });
        assert.ok(result.includes('成功抹除'));

        const memories = store.getMemories('u123');
        assert.equal(memories.length, 1);
        assert.equal(memories[0].content, '喜歡吃甜甜花釀雞');
    });

    it('returns not found message when forgetting non-existent memory', async () => {
        const result = await forgetTool.execute({ query: '外星人' }, { userId: 'u123', userName: '小明' });
        assert.ok(result.includes('未找到'));
    });
});
