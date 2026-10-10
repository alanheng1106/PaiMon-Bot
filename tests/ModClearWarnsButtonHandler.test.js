import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, ButtonStyle, MessageFlags } = require('discord.js');

const ModClearWarnsButtonHandler =
    require('../src/core/components/ModClearWarnsButtonHandler').default ||
    require('../src/core/components/ModClearWarnsButtonHandler');
const ComponentRouter =
    require('../src/core/components/ComponentRouter').default || require('../src/core/components/ComponentRouter');

describe('ModClearWarnsButtonHandler (Clear User Warnings)', () => {
    const handler = new ModClearWarnsButtonHandler();

    it('matches customId prefix mod:clearwarns:<userId>', () => {
        assert.equal(handler.customId, 'mod:clearwarns');
        assert.equal(handler.matches('mod:clearwarns:123456789012345678'), true);
        assert.equal(handler.matches('mod:clearwarns'), true);
        assert.equal(handler.matches('mod:ban:123456789012345678'), false);
        assert.equal(handler.matches('mod:history:123456789012345678'), false);
    });

    it('rejects execution outside cached guild', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => false,
            customId: 'mod:clearwarns:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects invalid snowflake user ID', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:clearwarns:invalid-id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
    });

    it('rejects execution when member lacks ModerateMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:clearwarns:123456789012345678',
            memberPermissions: {
                has: (perm) => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理成員/);
    });

    it('returns error when target user has no warnings to clear', async () => {
        let sentError = null;
        const mockBot = {
            settings: {
                get: () => ({})
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:clearwarns:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild-1' }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無記錄');
    });

    it('clears warnings, updates original message button, and sends success response', async () => {
        let savedWarnings = null;
        let sentSuccess = null;
        let messageEdited = false;

        const mockWarnings = [
            { reason: '違規 1', timestamp: '2026-01-01T00:00:00.000Z', by: 'Admin' },
            { reason: '違規 2', timestamp: '2026-02-01T00:00:00.000Z', by: 'Admin' }
        ];

        const mockBot = {
            settings: {
                get: () => ({ '123456789012345678': mockWarnings }),
                set: (guildId, key, val) => {
                    savedWarnings = val;
                }
            },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:clearwarns:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild-1' },
            message: {
                components: [
                    {
                        type: 17,
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        custom_id: 'mod:clearwarns:123456789012345678',
                                        label: '清除記錄',
                                        style: ButtonStyle.Secondary
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async () => {
                    messageEdited = true;
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);

        // Verify warnings deleted from settings
        assert.ok(savedWarnings);
        assert.equal(savedWarnings['123456789012345678'], undefined);

        // Verify message was updated with disabled button
        assert.equal(messageEdited, true);

        // Verify success response
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '清除成功');
        assert.match(sentSuccess.desc, /2/);
        assert.equal(sentSuccess.ephemeral, true);
    });

    it('defers reply when deferReply is available to prevent 3s timeout', async () => {
        let deferred = false;
        const mockWarnings = [{ reason: '測試', timestamp: '2026-01-01T00:00:00.000Z', by: 'Admin' }];
        const mockBot = {
            settings: {
                get: () => ({ '123456789012345678': mockWarnings }),
                set: () => {}
            },
            sendSuccess: async () => {}
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:clearwarns:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild-1' },
            deferReply: async ({ flags }) => {
                assert.equal(flags, MessageFlags.Ephemeral);
                deferred = true;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
    });

    it('routes through ComponentRouter correctly', async () => {
        const router = new ComponentRouter();
        router.register(handler);

        assert.equal(router.has('mod:clearwarns:123456789012345678'), true);
        assert.equal(router.has('mod:unknown:123456789012345678'), false);
    });
});
