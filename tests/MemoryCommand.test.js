import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import memoryCommand, { buildMemoryViewContainer } from '../src/commands/general/memory';

describe('Memory General Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(memoryCommand.data.name, 'memory');
        assert.equal(memoryCommand.category, 'general');

        const subcommands = memoryCommand.data.options.map((opt) => opt.name);
        assert.ok(subcommands.includes('view'));
        assert.ok(subcommands.includes('clear'));
    });

    describe('buildMemoryViewContainer', () => {
        it('renders empty notice when user has no memories', () => {
            const container = buildMemoryViewContainer('旅行者', 'https://example.com/avatar.png', []);
            const json = container.toJSON();

            const textContents = [];
            for (const comp of json.components || []) {
                if (comp.content) textContents.push(comp.content);
                if (comp.components) {
                    for (const sub of comp.components) {
                        if (sub.content) textContents.push(sub.content);
                    }
                }
            }
            const allText = textContents.join('\n');
            assert.ok(allText.includes('乾淨的一片'));
        });

        it('renders formatted memory list with emojis and dates', () => {
            const memories = [
                { id: '1', content: '習慣使用 TypeScript 開發', category: 'preference', createdAt: 1700000000000 },
                { id: '2', content: '正在製作 Discord 音樂機器人', category: 'project', createdAt: 1700000000000 }
            ];
            const container = buildMemoryViewContainer('小明', 'https://example.com/avatar.png', memories);
            const json = container.toJSON();

            const textContents = [];
            for (const comp of json.components || []) {
                if (comp.content) textContents.push(comp.content);
                if (comp.components) {
                    for (const sub of comp.components) {
                        if (sub.content) textContents.push(sub.content);
                    }
                }
            }
            const allText = textContents.join('\n');
            assert.ok(allText.includes('習慣使用 TypeScript 開發'));
            assert.ok(allText.includes('正在製作 Discord 音樂機器人'));
            assert.ok(allText.includes('⭐'));
            assert.ok(allText.includes('🛠️'));
        });
    });

    describe('execute', () => {
        it('handles unready memory store cleanly', async () => {
            let replied = null;
            const mockInteraction = {
                options: { getSubcommand: () => 'view' },
                user: { id: 'u1', username: 'Tester', displayAvatarURL: () => '' },
                member: null,
                reply: async (payload) => {
                    replied = payload;
                }
            };
            const mockBot = { userMemoryStore: null };

            await memoryCommand.execute(mockInteraction, mockBot);
            assert.ok(replied.content.includes('尚未就緒'));
        });

        it('executes view subcommand and returns components', async () => {
            let replied = null;
            const mockInteraction = {
                options: { getSubcommand: () => 'view' },
                user: { id: 'u1', username: '小明', displayAvatarURL: () => 'https://example.com/a.png' },
                member: { displayName: '小明哥' },
                reply: async (payload) => {
                    replied = payload;
                }
            };
            const mockBot = {
                userMemoryStore: {
                    getMemories: () => [{ id: '1', content: '喜歡 TypeScript', category: 'preference', createdAt: 1700000000000 }]
                }
            };

            await memoryCommand.execute(mockInteraction, mockBot);
            assert.ok(replied.components);
            assert.equal(replied.components.length, 1);
        });

        it('executes clear subcommand and empties memories', async () => {
            let replied = null;
            let cleared = false;
            const mockInteraction = {
                options: { getSubcommand: () => 'clear' },
                user: { id: 'u1', username: '小明', displayAvatarURL: () => '' },
                member: null,
                reply: async (payload) => {
                    replied = payload;
                }
            };
            const mockBot = {
                userMemoryStore: {
                    getMemories: () => (cleared ? [] : [{ id: '1', content: 'Test' }]),
                    clearMemories: () => {
                        cleared = true;
                    }
                }
            };

            await memoryCommand.execute(mockInteraction, mockBot);
            assert.equal(cleared, true);
            assert.ok(replied.content.includes('擦乾淨啦'));
        });
    });
});
