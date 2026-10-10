import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags, ButtonStyle } = require('discord.js');
const { Colors } = require('../src/config');

const slowmodeModule = require('../src/commands/admin/slowmode');
const slowmodeCommand = slowmodeModule.default || slowmodeModule;
const buildSlowmodeConsoleCard = slowmodeModule.buildSlowmodeConsoleCard;

describe('Slowmode Admin Command & Scheme B Console Builder', () => {
    it('has correct slash command configuration', () => {
        assert.equal(slowmodeCommand.data.name, 'slowmode');
        assert.equal(slowmodeCommand.data.dm_permission, false);
        assert.equal(slowmodeCommand.data.default_member_permissions, PermissionFlagsBits.ManageChannels.toString());
        assert.equal(slowmodeCommand.category, 'admin');

        const secondsOption = slowmodeCommand.data.options.find((opt) => opt.name === 'seconds');
        assert.ok(secondsOption);
        assert.equal(secondsOption.required, true);
        assert.equal(secondsOption.min_value, 0);
        assert.equal(secondsOption.max_value, 21600);
    });

    describe('buildSlowmodeConsoleCard (Scheme B — Interactive Rate-Control Console)', () => {
        const mockChannel = {
            id: '123456789012345678',
            name: 'general'
        };
        const mockExecutor = {
            id: '987654321098765432',
            username: 'admin',
            tag: 'admin#0000'
        };

        it('builds throttling console card when seconds > 0 with alert orange and action buttons', () => {
            const payload = buildSlowmodeConsoleCard({
                channel: mockChannel,
                seconds: 30,
                executor: mockExecutor
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, 0xe67e22); // Security Alert Orange

            const containerStr = JSON.stringify(container);
            // 標題
            assert.match(containerStr, /# 🛡️ 頻道流控管制生效/);
            // 頻道與限制
            assert.match(containerStr, /<#123456789012345678>/);
            assert.match(containerStr, /30 秒/);
            // 狀態說明
            assert.match(containerStr, /節流保護中/);
            // 快捷操作按鈕
            assert.match(containerStr, /mod:slowmode:reset:123456789012345678/);
            assert.match(containerStr, /解除慢速限制/);
            assert.match(containerStr, /mod:slowmode:set:123456789012345678:5/);
            assert.match(containerStr, /快速調為 5 秒/);
            // 底部審計
            assert.match(containerStr, /987654321098765432/);
        });

        it('builds release console card when seconds === 0 with success green and no redundant buttons', () => {
            const payload = buildSlowmodeConsoleCard({
                channel: mockChannel,
                seconds: 0,
                executor: mockExecutor
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, Colors.Success);

            const containerStr = JSON.stringify(container);
            // 標題
            assert.match(containerStr, /# 🚀 頻道流控已解除/);
            assert.match(containerStr, /無限制/);
            assert.match(containerStr, /常規模式/);
            // 無限制時不應有控制台按鈕
            assert.doesNotMatch(containerStr, /mod:slowmode:reset/);
        });

        it('adapts quick adjustment button to 15s when current seconds is 5', () => {
            const payload = buildSlowmodeConsoleCard({
                channel: mockChannel,
                seconds: 5,
                executor: mockExecutor
            });

            const containerStr = JSON.stringify(payload.components[0].toJSON());
            assert.match(containerStr, /mod:slowmode:set:123456789012345678:15/);
            assert.match(containerStr, /快速調為 15 秒/);
        });

        it('handles channel without id gracefully with name fallback', () => {
            const channelWithoutId = { name: 'fallback-chat' };
            const payload = buildSlowmodeConsoleCard({
                channel: channelWithoutId,
                seconds: 60,
                executor: mockExecutor
            });

            const containerStr = JSON.stringify(payload.components[0].toJSON());
            assert.match(containerStr, /\*\*#fallback-chat\*\*/);
            // channel.id 不存在時，不渲染按鈕
            assert.doesNotMatch(containerStr, /mod:slowmode:reset/);
        });
    });

    describe('Slash Command Execution', () => {
        it('rejects execution outside cached guild', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => false
            };

            await slowmodeCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '無法執行');
        });

        it('rejects execution when channel does not support slowmode', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                channel: {
                    name: 'invalid-channel'
                    // No setRateLimitPerUser function
                }
            };

            await slowmodeCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '操作無效');
            assert.match(sentError.desc, /無法在此頻道設定慢速模式/);
        });

        it('defers reply with ephemeral: true and edits reply with Scheme B card', async () => {
            let deferredOptions = null;
            let rateLimitArgs = null;
            let editedPayload = null;

            const mockChannel = {
                id: '111222333444555666',
                name: 'general',
                setRateLimitPerUser: async (secs, reason) => {
                    rateLimitArgs = { secs, reason };
                }
            };

            const mockBot = {
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                user: { id: '999888777666555444', tag: 'Admin#0001' },
                channel: mockChannel,
                options: {
                    getInteger: (name) => (name === 'seconds' ? 10 : null)
                },
                deferReply: async (opts) => {
                    deferredOptions = opts;
                },
                editReply: async (payload) => {
                    editedPayload = payload;
                }
            };

            await slowmodeCommand.execute(mockInteraction, mockBot);

            assert.ok(deferredOptions?.ephemeral === true || deferredOptions?.flags === MessageFlags.Ephemeral);
            assert.equal(rateLimitArgs.secs, 10);
            assert.match(rateLimitArgs.reason, /By Admin#0001/);
            assert.ok(editedPayload);
            assert.equal(editedPayload.flags, MessageFlags.IsComponentsV2);

            const containerJson = editedPayload.components[0].toJSON();
            assert.equal(containerJson.accent_color, 0xe67e22);
            assert.match(JSON.stringify(containerJson), /10 秒/);
        });

        it('falls back to bot.sendSuccess when editReply is not available on legacy mock', async () => {
            let sentSuccess = null;
            const mockChannel = {
                name: 'general',
                setRateLimitPerUser: async () => {}
            };

            const mockBot = {
                sendError: async () => {},
                sendSuccess: async (interaction, title, desc, ephemeral) => {
                    sentSuccess = { title, desc, ephemeral };
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                user: { tag: 'Admin#0001' },
                channel: mockChannel,
                options: {
                    getInteger: () => 0
                },
                deferReply: async () => {}
            };

            await slowmodeCommand.execute(mockInteraction, mockBot);

            assert.ok(sentSuccess);
            assert.match(sentSuccess.title, /慢速模式已關閉/);
            assert.equal(sentSuccess.ephemeral, true);
        });

        it('handles exceptions when setRateLimitPerUser fails', async () => {
            let sentError = null;
            const mockChannel = {
                name: 'general',
                setRateLimitPerUser: async () => {
                    throw new Error('DiscordAPIError[50013]: Missing Permissions');
                }
            };

            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                user: { tag: 'Admin#0001' },
                channel: mockChannel,
                options: {
                    getInteger: () => 10
                },
                deferReply: async () => {}
            };

            await slowmodeCommand.execute(mockInteraction, mockBot);

            assert.ok(sentError);
            assert.equal(sentError.title, '執行失敗');
            assert.match(sentError.desc, /管理頻道/);
        });
    });
});
