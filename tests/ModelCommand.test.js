import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../src/config';

const modelModule = require('../src/commands/general/model');
const modelCommand = modelModule.default || modelModule;
const { buildModelDashboardContainer, buildModelSelectMenu, buildModelButtonRow } = modelModule;

describe('Model General Command (All-in-One Interactive Dashboard)', () => {
    it('has correct slash command configuration', () => {
        assert.equal(modelCommand.data.name, 'model');
        assert.equal(modelCommand.category, 'general');
        assert.ok(modelCommand.helpText.includes('/model'));

        // Check no options or subcommands (pure /model command)
        assert.equal(modelCommand.data.options.length, 0, 'Must have no options or subcommands');
    });

    const createMockBot = (overrides = {}) => {
        let activeModelId = 'vtc-deepseek';
        const mockModels = [
            {
                id: 'vtc-gpt',
                name: 'GPT-5.4 (VTC 網關)',
                providerKey: 'vtc',
                model: 'gpt-5.4',
                provider: { ready: true },
                description: 'VTC GenAI'
            },
            {
                id: 'vtc-deepseek',
                name: 'DeepSeek-V4 Pro Thinking (VTC 網關)',
                providerKey: 'vtc',
                model: 'deepseek-v4-pro-thinking',
                provider: { ready: true },
                description: 'VTC GenAI'
            }
        ];

        return {
            user: {
                id: '123456789012345678',
                displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
            },
            ai: {
                modelRegistry: {
                    getActiveModelId: () => activeModelId,
                    getModel: (id) => mockModels.find((m) => m.id === id) || null
                },
                getActiveModel: (_guildId) => mockModels.find((m) => m.id === activeModelId) || mockModels[0],
                getModelList: (_guildId) =>
                    mockModels.map((m) => ({
                        ...m,
                        isAvailable: m.provider.ready,
                        isDefault: m.id === activeModelId
                    })),
                switchModel: (targetId, _guildId) => {
                    const found = mockModels.find((m) => m.id === targetId);
                    if (found) {
                        activeModelId = targetId;
                        return true;
                    }
                    return false;
                },
                testModel: async (_id) => ({ ok: true, latency: 120 })
            },
            sendError: async (interaction, title, desc) => {
                interaction.lastError = { title, desc };
            },
            ...overrides
        };
    };

    describe('Card Builders', () => {
        it('buildModelDashboardContainer constructs full-width CV2 container with embedded buttons', () => {
            const bot = createMockBot();
            const container = buildModelDashboardContainer(bot, 'guild-1', null, false);
            const json = container.toJSON();
            const dump = JSON.stringify(json);

            assert.ok(dump.includes('AI 跨平台模型調度中心'));
            assert.ok(dump.includes('VTC GenAI'));
            assert.ok(dump.includes('DeepSeek-V4 Pro Thinking'));
            assert.ok(dump.includes('GPT-5.4'));

            // Verify no markdown blockquotes (>), no subtexts (-# / ~#), no hint text
            assert.ok(!/(?:^|["\n])>\s/.test(dump), 'Must not contain blockquotes (>)');
            assert.ok(!dump.includes('-#'), 'Must not contain subtext (-#)');
            assert.ok(!dump.includes('~#'), 'Must not contain subtext (~#)');
            assert.ok(!dump.includes('操作提示'), 'Must not contain hint text');

            // Verify all buttons are embedded inside container
            const hasButtons = json.components.some(
                (c) => c.type === 1 && c.components && c.components.some((b) => b.custom_id === 'model_btn_ping')
            );
            assert.ok(hasButtons, 'Container must include the buttons inside');
        });

        it('buildModelDashboardContainer highlights latency and adjusts accent color when testResult is present', () => {
            const bot = createMockBot();
            const successContainer = buildModelDashboardContainer(bot, 'guild-1', { ok: true, latency: 85 });
            assert.equal(successContainer.toJSON().accent_color, Colors.Success);

            const failContainer = buildModelDashboardContainer(bot, 'guild-1', {
                ok: false,
                latency: -1,
                error: '逾時'
            });
            assert.equal(failContainer.toJSON().accent_color, Colors.Error);
        });

        it('buildModelSelectMenu constructs interactive select menu with active item selected', () => {
            const row = buildModelSelectMenu('vtc-deepseek', false);
            const json = row.toJSON();
            assert.equal(json.components[0].custom_id, 'model_select_menu');
            const deepseekOpt = json.components[0].options.find((o) => o.value === 'vtc-deepseek');
            assert.ok(deepseekOpt);
            assert.equal(deepseekOpt.default, true);
            assert.equal(deepseekOpt.emoji?.id, '1552670847406313562');

            const geminiOpt = json.components[0].options.find((o) => o.value === 'vtc-gemini');
            assert.ok(geminiOpt);
            assert.equal(geminiOpt.emoji?.id, '1552670563749724302');

            const gptOpt = json.components[0].options.find((o) => o.value === 'vtc-gpt');
            assert.ok(gptOpt);
            assert.equal(gptOpt.emoji?.id, '1552673091241508945');

            const qwenOpt = json.components[0].options.find((o) => o.value === 'vtc-qwen');
            assert.ok(qwenOpt);
            assert.equal(qwenOpt.emoji?.id, '1552672304461254737');

            const grokOpt = json.components[0].options.find((o) => o.value === 'meowai-grok-4.7');
            assert.ok(grokOpt);
            assert.equal(grokOpt.emoji?.id, '1553008331390722048');

            const gpt61Opt = json.components[0].options.find((o) => o.value === 'meowai-gpt-6.1-sol');
            assert.ok(gpt61Opt);
            assert.equal(gpt61Opt.emoji?.id, '1552673091241508945');

            const gptOssOpt = json.components[0].options.find((o) => o.value === 'ol-gpt-oss-120b');
            assert.ok(gptOssOpt);
            assert.equal(gptOssOpt.emoji?.id, '1552673091241508945');

            assert.equal(json.components[0].options.length, 7, 'Select menu must contain all 7 registered models');
        });

        it('buildModelButtonRow constructs ping, scope and refresh buttons', () => {
            const row = buildModelButtonRow(false, false);
            const json = row.toJSON();
            assert.equal(json.components.length, 3);
            assert.equal(json.components[0].custom_id, 'model_btn_ping');
            assert.equal(json.components[1].custom_id, 'model_btn_scope');
            assert.equal(json.components[2].custom_id, 'model_btn_refresh');
        });
    });

    describe('Execution', () => {
        it('executes /model and replies with unified container (with buttons inside) and select menu', async () => {
            const bot = createMockBot();
            let replyPayload = null;
            const mockInteraction = {
                guildId: 'guild-1',
                user: { id: 'user-1' },
                options: {
                    getString: () => null
                },
                reply: async (payload) => {
                    replyPayload = payload;
                },
                fetchReply: async () => ({
                    createMessageComponentCollector: () => ({
                        on: () => {}
                    })
                })
            };

            await modelCommand.execute(mockInteraction, bot);

            assert.ok(replyPayload);
            assert.equal(replyPayload.components.length, 2); // Container (with buttons inside) + SelectMenu
            const containerJson = replyPayload.components[0].toJSON();
            const hasButtons = containerJson.components.some(
                (c) => c.type === 1 && c.components && c.components.some((b) => b.custom_id === 'model_btn_ping')
            );
            assert.ok(hasButtons, 'Container in reply payload must contain buttons inside');
        });

        it('defers update on ping button click to prevent 3-second timeout and updates with editReply', async () => {
            const bot = createMockBot();
            let collectorHandler = null;
            const mockInteraction = {
                guildId: 'guild-1',
                user: { id: 'user-1' },
                options: {
                    getString: () => null
                },
                reply: async () => {},
                fetchReply: async () => ({
                    createMessageComponentCollector: () => ({
                        on: (event, handler) => {
                            if (event === 'collect') collectorHandler = handler;
                        }
                    })
                })
            };

            await modelCommand.execute(mockInteraction, bot);
            assert.ok(collectorHandler, 'Collector collect handler should be registered');

            let deferredCalled = false;
            let editReplyCalled = false;
            const mockBtnInteraction = {
                user: { id: 'user-1' },
                customId: 'model_btn_ping',
                isButton: () => true,
                isStringSelectMenu: () => false,
                deferred: false,
                deferUpdate: async () => {
                    deferredCalled = true;
                    mockBtnInteraction.deferred = true;
                },
                editReply: async () => {
                    editReplyCalled = true;
                },
                update: async () => {
                    assert.fail('Should use editReply when deferred');
                }
            };

            await collectorHandler(mockBtnInteraction);
            assert.equal(deferredCalled, true, 'deferUpdate must be called before testing latency');
            assert.equal(editReplyCalled, true, 'editReply must be called after deferred update');
        });

        it('allows bot owner to switch server model even without ManageGuild or Admin permissions', async () => {
            const originalOwner = process.env.OWNER_ID;
            process.env.OWNER_ID = 'owner-super-id';

            try {
                const bot = createMockBot();
                let switchedModelId = null;
                bot.ai.switchModel = (modelId) => {
                    switchedModelId = modelId;
                    return true;
                };

                let collectorHandler = null;
                const mockInteraction = {
                    guildId: 'foreign-guild-123',
                    user: { id: 'owner-super-id' },
                    options: { getString: () => null },
                    reply: async () => {},
                    fetchReply: async () => ({
                        createMessageComponentCollector: () => ({
                            on: (event, handler) => {
                                if (event === 'collect') collectorHandler = handler;
                            }
                        })
                    })
                };

                await modelCommand.execute(mockInteraction, bot);

                const mockSelectInteraction = {
                    user: { id: 'owner-super-id' },
                    customId: 'model_select_menu',
                    values: ['meowai-gpt-6.1-sol'],
                    isButton: () => false,
                    isStringSelectMenu: () => true,
                    memberPermissions: {
                        has: () => false // NO admin, NO ManageGuild
                    },
                    update: async () => {}
                };

                await collectorHandler(mockSelectInteraction);
                assert.equal(switchedModelId, 'meowai-gpt-6.1-sol', 'Owner should switch model regardless of guild permissions');
            } finally {
                process.env.OWNER_ID = originalOwner;
            }
        });

        it('rejects non-owner user without ManageGuild permission from switching server model', async () => {
            const originalOwner = process.env.OWNER_ID;
            process.env.OWNER_ID = 'different-owner';

            try {
                const bot = createMockBot();
                let switched = false;
                bot.ai.switchModel = () => {
                    switched = true;
                    return true;
                };

                let collectorHandler = null;
                let rejectionContent = '';
                const mockInteraction = {
                    guildId: 'foreign-guild-123',
                    user: { id: 'regular-user' },
                    options: { getString: () => null },
                    reply: async () => {},
                    fetchReply: async () => ({
                        createMessageComponentCollector: () => ({
                            on: (event, handler) => {
                                if (event === 'collect') collectorHandler = handler;
                            }
                        })
                    })
                };

                await modelCommand.execute(mockInteraction, bot);

                const mockSelectInteraction = {
                    user: { id: 'regular-user' },
                    customId: 'model_select_menu',
                    values: ['vtc-gpt'],
                    isButton: () => false,
                    isStringSelectMenu: () => true,
                    memberPermissions: {
                        has: () => false
                    },
                    reply: async (payload) => {
                        rejectionContent = payload.content;
                    },
                    update: async () => {}
                };

                await collectorHandler(mockSelectInteraction);
                assert.equal(switched, false, 'Non-owner without permissions should NOT switch model');
                assert.ok(rejectionContent.includes('需具有「管理伺服器」權限'));
            } finally {
                process.env.OWNER_ID = originalOwner;
            }
        });

        it('rejects non-owner server admin from toggling to global scope via model_btn_scope', async () => {
            const originalOwner = process.env.OWNER_ID;
            process.env.OWNER_ID = 'real-bot-owner';

            try {
                const bot = createMockBot();
                let collectorHandler = null;
                const mockInteraction = {
                    guildId: 'guild-123',
                    user: { id: 'guild-admin' },
                    options: { getString: () => null },
                    reply: async () => {},
                    fetchReply: async () => ({
                        createMessageComponentCollector: () => ({
                            on: (event, handler) => {
                                if (event === 'collect') collectorHandler = handler;
                            }
                        })
                    })
                };

                await modelCommand.execute(mockInteraction, bot);

                let rejectionContent = '';
                const mockBtnInteraction = {
                    user: { id: 'guild-admin' },
                    customId: 'model_btn_scope',
                    isButton: () => true,
                    isStringSelectMenu: () => false,
                    memberPermissions: {
                        has: (perm) => true // Administrator = true
                    },
                    reply: async (payload) => {
                        rejectionContent = payload.content;
                    },
                    update: async () => {}
                };

                await collectorHandler(mockBtnInteraction);
                assert.ok(
                    rejectionContent.includes('只有機器人擁有者才能切換至全域預設範圍'),
                    'Server admin must be rejected from toggling to global scope'
                );
            } finally {
                process.env.OWNER_ID = originalOwner;
            }
        });

        it('rejects non-owner server admin from switching global model in model_select_menu', async () => {
            const originalOwner = process.env.OWNER_ID;
            process.env.OWNER_ID = 'real-bot-owner';

            try {
                const bot = createMockBot();
                let switched = false;
                bot.ai.switchModel = () => {
                    switched = true;
                    return true;
                };

                let collectorHandler = null;
                const mockInteraction = {
                    guildId: null, // DM / Global context
                    user: { id: 'some-user' },
                    options: { getString: () => null },
                    reply: async () => {},
                    fetchReply: async () => ({
                        createMessageComponentCollector: () => ({
                            on: (event, handler) => {
                                if (event === 'collect') collectorHandler = handler;
                            }
                        })
                    })
                };

                await modelCommand.execute(mockInteraction, bot);

                let rejectionContent = '';
                const mockSelectInteraction = {
                    user: { id: 'some-user' },
                    customId: 'model_select_menu',
                    values: ['vtc-gpt'],
                    isButton: () => false,
                    isStringSelectMenu: () => true,
                    memberPermissions: {
                        has: () => true
                    },
                    reply: async (payload) => {
                        rejectionContent = payload.content;
                    },
                    update: async () => {}
                };

                await collectorHandler(mockSelectInteraction);
                assert.equal(switched, false, 'Non-owner must NOT switch global model');
                assert.ok(
                    rejectionContent.includes('只有機器人擁有者才能設定全域預設模型'),
                    'Non-owner must be rejected with global owner notice'
                );
            } finally {
                process.env.OWNER_ID = originalOwner;
            }
        });
    });
});
