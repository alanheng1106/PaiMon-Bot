import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../src/config';

const aboutModule = require('../src/commands/general/about');
const aboutCommand = aboutModule.default || aboutModule;
const { buildAboutContainer } = aboutModule;

describe('About General Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(aboutCommand.data.name, 'about');
        assert.equal(aboutCommand.category, 'general');
        assert.ok(aboutCommand.helpText.includes('/about'));
    });

    describe('buildAboutContainer', () => {
        const createMockBot = (overrides = {}) => ({
            user: {
                id: '123456789012345678',
                username: 'PaiMon',
                discriminator: '0',
                displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
                ...overrides.user
            },
            guilds: {
                cache: {
                    size: 42
                }
            },
            ...overrides
        });

        it('sets accent color to Colors.Success (operational health)', () => {
            const bot = createMockBot();
            const container = buildAboutContainer(bot, false);
            const json = container.toJSON();

            assert.equal(json.accent_color, Colors.Success);
        });

        it('implements true Markdown Heading hierarchy (# for Title, ### for Sections)', () => {
            const bot = createMockBot();
            const container = buildAboutContainer(bot, false);
            const json = container.toJSON();

            // Find all TextDisplay components across root and nested sections
            const textContents = [];
            for (const comp of json.components || []) {
                if (comp.type === 10 || comp.content) {
                    textContents.push(comp.content);
                }
                if (comp.components) {
                    for (const sub of comp.components) {
                        if (sub.content) textContents.push(sub.content);
                    }
                }
            }

            const allText = textContents.join('\n');

            // 1. Top Title must be a true H1 Heading (#)
            assert.match(allText, /^# 🤖 系統運作狀態/m, 'Must contain Level 1 Markdown Heading (#)');

            // 2. Section Identity must contain Level 3 Heading (###)
            assert.match(allText, /### PaiMon/, 'Identity section must contain Level 3 Markdown Heading (###)');

            // 3. Service Metrics must contain Level 3 Heading (###)
            assert.match(allText, /### 📊 服務運行數據/, 'Service block must contain Level 3 Markdown Heading (###)');

            // 4. Resource Load must contain Level 3 Heading (###)
            assert.match(allText, /### 🖥️ 資源負載狀態/, 'Hardware block must contain Level 3 Markdown Heading (###)');

            // 5. Must include subtext (-#) for environment and dynamic timestamp
            assert.match(allText, /-# ⚙️ 執行環境：Node\.js/, 'Must use -# for environment metadata');
            assert.match(allText, /-# 🕒 最後更新：<t:\d+:T>/, 'Must include dynamic Discord timestamp');
        });

        it('includes thumbnail accessory matching identity section height', () => {
            const bot = createMockBot();
            const container = buildAboutContainer(bot, false);
            const json = container.toJSON();

            const sectionComp = json.components.find((c) => c.accessory);
            assert.ok(sectionComp, 'Expected section with accessory');
            assert.equal(sectionComp.accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');
        });

        it('handles missing avatar gracefully by falling back to default avatar URL', () => {
            const bot = createMockBot({
                user: {
                    id: '999',
                    username: 'NoAvatarBot',
                    discriminator: '1234',
                    displayAvatarURL: null
                }
            });
            const container = buildAboutContainer(bot, false);
            const json = container.toJSON();

            const sectionComp = json.components.find((c) => c.accessory);
            assert.ok(sectionComp, 'Expected section with accessory');
            assert.equal(sectionComp.accessory.media.url, 'https://cdn.discordapp.com/embed/avatars/0.png');
        });

        it('disables refresh button when disabled flag is true', () => {
            const bot = createMockBot();
            const activeContainer = buildAboutContainer(bot, false).toJSON();
            const disabledContainer = buildAboutContainer(bot, true).toJSON();

            const findButton = (c) => {
                for (const item of c.components || []) {
                    if (item.components) {
                        const btn = item.components.find((b) => b.custom_id === 'refresh_about');
                        if (btn) return btn;
                    }
                }
                return null;
            };

            const activeBtn = findButton(activeContainer);
            const disabledBtn = findButton(disabledContainer);

            assert.ok(activeBtn);
            assert.equal(activeBtn.disabled, false);

            assert.ok(disabledBtn);
            assert.equal(disabledBtn.disabled, true);
        });
    });

    describe('execute interaction lifecycle', () => {
        it('replies with Components V2 container and manages button collector events', async () => {
            let repliedOptions = null;
            let collectorEvents = {};
            let editedOptions = null;

            const mockCollector = {
                on: (event, handler) => {
                    collectorEvents[event] = handler;
                }
            };

            const mockInteraction = {
                user: { id: 'user-initiator' },
                reply: async (opts) => {
                    repliedOptions = opts;
                },
                fetchReply: async () => ({
                    createMessageComponentCollector: (opts) => {
                        assert.equal(opts.time, 300_000);
                        return mockCollector;
                    }
                }),
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                user: {
                    id: '123',
                    username: 'PaiMon',
                    discriminator: '0',
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                },
                guilds: { cache: { size: 10 } },
                sendError: async () => {}
            };

            await aboutCommand.execute(mockInteraction, mockBot);

            assert.ok(repliedOptions);
            assert.ok(repliedOptions.components);
            assert.equal(repliedOptions.flags, 32768); // MessageFlags.IsComponentsV2

            // Test unauthorized button click
            let unauthorizedReply = null;
            const mockStrangerClick = {
                user: { id: 'stranger-999' },
                reply: async (opts) => {
                    unauthorizedReply = opts;
                }
            };
            await collectorEvents['collect'](mockStrangerClick);
            assert.ok(unauthorizedReply);
            assert.ok(unauthorizedReply.content.includes('屬於發起指令的成員'));

            // Test authorized button refresh
            let updatedReply = null;
            const mockOwnerClick = {
                user: { id: 'user-initiator' },
                customId: 'refresh_about',
                update: async (opts) => {
                    updatedReply = opts;
                }
            };
            await collectorEvents['collect'](mockOwnerClick);
            assert.ok(updatedReply);
            assert.ok(updatedReply.components);

            // Test collector timeout (end)
            collectorEvents['end']();
            // Allow event loop to run editReply catch
            await new Promise((r) => setImmediate(r));
            assert.ok(editedOptions);
            assert.ok(editedOptions.components);
        });

        it('catches and reports unexpected exceptions cleanly via bot.sendError', async () => {
            let sentError = null;

            const mockInteraction = {
                user: { id: 'user-1' },
                reply: async () => {
                    throw new Error('Discord Gateway API Drop');
                }
            };

            const mockBot = {
                user: { id: '1' },
                guilds: { cache: { size: 1 } },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };

            await aboutCommand.execute(mockInteraction, mockBot);

            assert.ok(sentError);
            assert.equal(sentError.title, '查詢失敗');
        });
    });
});
