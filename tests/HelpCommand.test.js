import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../src/config';

const helpModule = require('../src/commands/general/help');
const helpCommand = helpModule.default || helpModule;
const { buildHelpHomeContainer, buildHelpCategoryContainer, buildHelpSelectMenu, CATEGORY_META } = helpModule;

describe('Help General Command (Components V2 A+C Fusion)', () => {
    it('has correct slash command configuration', () => {
        assert.equal(helpCommand.data.name, 'help');
        assert.equal(helpCommand.category, 'general');
        assert.ok(helpCommand.helpText.includes('/help'));
    });

    const createMockBot = (overrides = {}) => ({
        user: {
            id: '998877665544332211',
            username: 'PaiMon',
            discriminator: '0',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/9988/avatar.png',
            ...overrides.user
        },
        commands: new Map([
            [
                'ping',
                {
                    data: { name: 'ping', description: '查看機器人延遲' },
                    category: 'general'
                }
            ],
            [
                'about',
                {
                    data: { name: 'about', description: '查看系統狀態' },
                    category: 'general'
                }
            ],
            [
                'play',
                {
                    data: { name: 'play', description: '播放音樂歌曲' },
                    category: 'music'
                }
            ],
            [
                'queue',
                {
                    data: { name: 'queue', description: '查看目前播放佇列' },
                    category: 'music'
                }
            ],
            [
                'kick',
                {
                    data: { name: 'kick', description: '將指定成員踢出伺服器' },
                    category: 'admin'
                }
            ]
        ]),
        sendError: async () => {},
        ...overrides
    });

    describe('buildHelpHomeContainer', () => {
        it('sets accent color to Colors.Info', () => {
            const bot = createMockBot();
            const container = buildHelpHomeContainer(bot, false);
            const json = container.toJSON();

            assert.equal(json.accent_color, Colors.Info);
        });

        it('contains Level 1 Heading (#) for global title', () => {
            const bot = createMockBot();
            const container = buildHelpHomeContainer(bot, false);
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

            assert.match(allText, /^# 📖 派蒙指令指南/m, 'Must contain H1 Markdown Heading');
        });

        it('contains Hero Section with Bot Avatar Thumbnail Accessory', () => {
            const bot = createMockBot();
            const container = buildHelpHomeContainer(bot, false);
            const json = container.toJSON();

            // Find Section component (type 9 or has accessory)
            const section = (json.components || []).find((c) => c.type === 9 || c.accessory);
            assert.ok(section, 'Must contain a Section component');
            assert.ok(section.accessory, 'Section must have an accessory');
            assert.equal(section.accessory.type, 11, 'Accessory must be Thumbnail (type 11)');
            assert.equal(section.accessory.media?.url, 'https://cdn.discordapp.com/avatars/9988/avatar.png');
        });

        it('contains Module Overview List and Subtext (-#)', () => {
            const bot = createMockBot();
            const container = buildHelpHomeContainer(bot, false);
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

            assert.match(allText, /### 🗂️ 支援模組總覽/);
            assert.match(allText, /音樂模組 \(Music\)/);
            assert.match(allText, /管理工具 \(Admin\)/);
            assert.equal(allText.includes('> '), false, 'Module overview should use normal text without > blockquotes');
        });

        it('contains Plan C ActionRow with Link buttons (Invite and Support)', () => {
            const bot = createMockBot();
            const container = buildHelpHomeContainer(bot, false);
            const json = container.toJSON();

            // Find ActionRow component (type 1)
            const actionRow = (json.components || []).find((c) => c.type === 1);
            assert.ok(actionRow, 'Container must include ActionRow component');

            const buttons = actionRow.components || [];
            assert.ok(buttons.length >= 2, 'ActionRow must contain at least 2 action buttons');

            // Button 1: Invite link
            const inviteBtn = buttons.find((b) => b.label === '邀請派蒙');
            assert.ok(inviteBtn, 'Must have invite button');
            assert.equal(inviteBtn.style, 5, 'Invite button must be Link style (5)');
            assert.ok(inviteBtn.url.includes('client_id=998877665544332211'));

            // Button 2: Support link
            const supportBtn = buttons.find((b) => b.label.includes('官方支援'));
            assert.ok(supportBtn, 'Must have support button');
            assert.equal(supportBtn.style, 5, 'Support button must be Link style (5)');
        });
    });

    describe('buildHelpCategoryContainer', () => {
        it('dynamically switches accent color per category', () => {
            const bot = createMockBot();

            const musicContainer = buildHelpCategoryContainer(bot, 'music', false).toJSON();
            assert.equal(musicContainer.accent_color, Colors.Music);

            const adminContainer = buildHelpCategoryContainer(bot, 'admin', false).toJSON();
            assert.equal(adminContainer.accent_color, Colors.Punish);

            const generalContainer = buildHelpCategoryContainer(bot, 'general', false).toJSON();
            assert.equal(generalContainer.accent_color, Colors.Success);

            const ownerContainer = buildHelpCategoryContainer(bot, 'owner', false).toJSON();
            assert.equal(ownerContainer.accent_color, Colors.Warning);
        });

        it('falls back to home container when category is invalid', () => {
            const bot = createMockBot();
            const container = buildHelpCategoryContainer(bot, 'nonexistent_xyz', false).toJSON();
            assert.equal(container.accent_color, Colors.Info);
        });

        it('formats command list with bullet points and bold descriptions', () => {
            const bot = createMockBot();
            const container = buildHelpCategoryContainer(bot, 'music', false).toJSON();

            const textContents = [];
            for (const comp of container.components || []) {
                if (comp.content) textContents.push(comp.content);
            }
            const allText = textContents.join('\n');

            assert.match(allText, /## 🎶 音樂模組 \(Music\)/);
            assert.match(allText, /### 📋 指令列表 \(2\)/);
            assert.match(allText, /• `\/play` — \*\*播放音樂歌曲\*\*/);
            assert.match(allText, /• `\/queue` — \*\*查看目前播放佇列\*\*/);
            assert.equal(allText.includes('💡 提示'), false, 'Should not contain contextual tip text');
        });

        it('handles empty command list gracefully', () => {
            const bot = createMockBot({ commands: new Map() });
            const container = buildHelpCategoryContainer(bot, 'owner', false).toJSON();

            const textContents = [];
            for (const comp of container.components || []) {
                if (comp.content) textContents.push(comp.content);
            }
            const allText = textContents.join('\n');

            assert.match(allText, /該模組目前沒有載入任何可用指令/);
        });

        it('contains Return Home button (help_home) and Link buttons in ActionRow', () => {
            const bot = createMockBot();
            const container = buildHelpCategoryContainer(bot, 'music', false).toJSON();

            const actionRow = (container.components || []).find((c) => c.type === 1);
            assert.ok(actionRow, 'Must include ActionRow');

            const homeBtn = actionRow.components.find((b) => b.custom_id === 'help_home');
            assert.ok(homeBtn, 'Must include Return Home button');
            assert.equal(homeBtn.label, '返回首頁');
            assert.equal(homeBtn.style, 2, 'Must be Secondary style (2)');
            assert.equal(homeBtn.disabled, false);
        });

        it('disables Return Home button when disabled parameter is true', () => {
            const bot = createMockBot();
            const container = buildHelpCategoryContainer(bot, 'admin', true).toJSON();

            const actionRow = (container.components || []).find((c) => c.type === 1);
            const homeBtn = actionRow.components.find((b) => b.custom_id === 'help_home');
            assert.equal(homeBtn.disabled, true);
        });
    });

    describe('buildHelpSelectMenu', () => {
        it('builds StringSelectMenu with default selected value and all categories', () => {
            const menuRow = buildHelpSelectMenu('music', false).toJSON();
            assert.equal(menuRow.type, 1);

            const select = menuRow.components[0];
            assert.equal(select.type, 3);
            assert.equal(select.custom_id, 'help_menu');
            assert.equal(select.disabled, false);

            const homeOption = select.options.find((o) => o.value === 'home');
            assert.ok(homeOption);
            assert.equal(homeOption.default, false);

            const musicOption = select.options.find((o) => o.value === 'music');
            assert.ok(musicOption);
            assert.equal(musicOption.default, true);
        });

        it('disables select menu when disabled flag is true', () => {
            const menuRow = buildHelpSelectMenu('home', true).toJSON();
            assert.equal(menuRow.components[0].disabled, true);
        });
    });

    describe('execute Interaction flow', () => {
        const createMockCollector = () => {
            const handlers = {};
            return {
                on: (event, handler) => {
                    handlers[event] = handler;
                },
                emit: (event, ...args) => {
                    if (handlers[event]) return handlers[event](...args);
                }
            };
        };

        it('replies with Components V2 container, select menu, and flags', async () => {
            let replyPayload = null;
            const collector = createMockCollector();

            const mockInteraction = {
                user: { id: 'user_123' },
                reply: async (payload) => {
                    replyPayload = payload;
                },
                fetchReply: async () => ({
                    createMessageComponentCollector: () => collector
                }),
                editReply: async () => {}
            };

            const bot = createMockBot();
            await helpCommand.execute(mockInteraction, bot);

            assert.ok(replyPayload);
            assert.equal(replyPayload.flags, 32768, 'Must include MessageFlags.IsComponentsV2 (32768)');
            assert.equal(replyPayload.components.length, 2);
            assert.equal(replyPayload.components[0].toJSON().accent_color, Colors.Info);
        });

        it('updates container when user selects a category from select menu', async () => {
            const collector = createMockCollector();
            const mockInteraction = {
                user: { id: 'user_123' },
                reply: async () => {},
                fetchReply: async () => ({
                    createMessageComponentCollector: () => collector
                }),
                editReply: async () => {}
            };

            const bot = createMockBot();
            await helpCommand.execute(mockInteraction, bot);

            let updatePayload = null;
            const mockSelectInteraction = {
                user: { id: 'user_123' },
                isStringSelectMenu: () => true,
                isButton: () => false,
                customId: 'help_menu',
                values: ['music'],
                update: async (payload) => {
                    updatePayload = payload;
                }
            };

            await collector.emit('collect', mockSelectInteraction);

            assert.ok(updatePayload);
            assert.equal(updatePayload.components[0].toJSON().accent_color, Colors.Music);
        });

        it('updates container back to home when user clicks Return Home button', async () => {
            const collector = createMockCollector();
            const mockInteraction = {
                user: { id: 'user_123' },
                reply: async () => {},
                fetchReply: async () => ({
                    createMessageComponentCollector: () => collector
                }),
                editReply: async () => {}
            };

            const bot = createMockBot();
            await helpCommand.execute(mockInteraction, bot);

            // Step 1: Switch to music
            await collector.emit('collect', {
                user: { id: 'user_123' },
                isStringSelectMenu: () => true,
                isButton: () => false,
                customId: 'help_menu',
                values: ['music'],
                update: async () => {}
            });

            // Step 2: Click Return Home button
            let homePayload = null;
            await collector.emit('collect', {
                user: { id: 'user_123' },
                isStringSelectMenu: () => false,
                isButton: () => true,
                customId: 'help_home',
                update: async (payload) => {
                    homePayload = payload;
                }
            });

            assert.ok(homePayload);
            assert.equal(homePayload.components[0].toJSON().accent_color, Colors.Info);
        });

        it('rejects unauthorized users with ephemeral warning', async () => {
            const collector = createMockCollector();
            const mockInteraction = {
                user: { id: 'owner_user' },
                reply: async () => {},
                fetchReply: async () => ({
                    createMessageComponentCollector: () => collector
                }),
                editReply: async () => {}
            };

            const bot = createMockBot();
            await helpCommand.execute(mockInteraction, bot);

            let ephemReply = null;
            await collector.emit('collect', {
                user: { id: 'intruder_user' },
                reply: async (payload) => {
                    ephemReply = payload;
                }
            });

            assert.ok(ephemReply);
            assert.equal(ephemReply.flags, 64, 'Must be Ephemeral');
            assert.match(ephemReply.content, /這個選單不是你的/);
        });

        it('disables components on collector timeout end', async () => {
            const collector = createMockCollector();
            let editedPayload = null;
            const mockInteraction = {
                user: { id: 'user_123' },
                reply: async () => {},
                fetchReply: async () => ({
                    createMessageComponentCollector: () => collector
                }),
                editReply: async (payload) => {
                    editedPayload = payload;
                }
            };

            const bot = createMockBot();
            await helpCommand.execute(mockInteraction, bot);

            await collector.emit('end');

            assert.ok(editedPayload);
            const selectRow = editedPayload.components[1].toJSON();
            assert.equal(selectRow.components[0].disabled, true);
        });

        it('handles unexpected exceptions cleanly with bot.sendError', async () => {
            let errorTitle = null;
            const bot = createMockBot({
                sendError: async (interaction, title) => {
                    errorTitle = title;
                }
            });

            const failingInteraction = {
                reply: () => {
                    throw new Error('Discord API connection dropped');
                }
            };

            await helpCommand.execute(failingInteraction, bot);
            assert.equal(errorTitle, '指令手冊開啟失敗');
        });
    });
});
