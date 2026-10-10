import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags, ButtonStyle } = require('discord.js');
const { Colors } = require('../src/config');

const ModSlowmodeButtonHandler =
    require('../src/core/components/ModSlowmodeButtonHandler').default ||
    require('../src/core/components/ModSlowmodeButtonHandler');

describe('ModSlowmodeButtonHandler (Scheme B Interactive Console Controls)', () => {
    const handler = new ModSlowmodeButtonHandler();

    it('matches customId prefix mod:slowmode:(reset|set):<channelId>', () => {
        assert.equal(handler.customId, 'mod:slowmode');
        assert.equal(handler.matches('mod:slowmode:reset:123456789012345678'), true);
        assert.equal(handler.matches('mod:slowmode:set:123456789012345678:5'), true);
        assert.equal(handler.matches('mod:slowmode'), true);
        assert.equal(handler.matches('mod:rename:reset:123456789012345678'), false);
        assert.equal(handler.matches('mod:unlock:123456789012345678'), false);
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
            customId: 'mod:slowmode:reset:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects malformed customId with insufficient segments', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /無法解析有效的慢速控制參數/);
    });

    it('rejects malformed customId with invalid snowflake ID', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:invalid_id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /無法解析有效的頻道 ID/);
    });

    it('rejects unknown action type', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:unknown:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /未知的慢速控制操作類型/);
    });

    it('rejects invalid seconds in set action', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:set:123456789012345678:not_a_number'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /無效的慢速冷卻秒數/);
    });

    it('rejects execution when member lacks ManageChannels permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            memberPermissions: {
                has: (perm) => perm !== PermissionFlagsBits.ManageChannels
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理頻道/);
    });

    it('rejects execution when channel does not exist or does not support slowmode', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                channels: {
                    cache: new Map(),
                    fetch: async () => null
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無頻道');
    });

    it('rejects execution when bot lacks ManageChannels permission in channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockChannel = {
            id: '123456789012345678',
            rateLimitPerUser: 10,
            setRateLimitPerUser: async () => {},
            permissionsFor: () => ({
                has: (perm) => perm !== PermissionFlagsBits.ManageChannels
            })
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /我在該頻道缺少「管理頻道」/);
    });

    it('rejects execution when channel already matches target rate limit (no-op guard)', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockChannel = {
            id: '123456789012345678',
            rateLimitPerUser: 0,
            setRateLimitPerUser: async () => {},
            permissionsFor: () => ({
                has: () => true
            })
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無變更');
        assert.match(sentError.desc, /目前未處於慢速模式/);
    });

    it('successfully resets slowmode to 0s and updates the console card in-place via deferUpdate and editReply', async () => {
        let deferredUpdateCalled = false;
        let rateLimitArgs = null;
        let editedPayload = null;

        const mockChannel = {
            id: '123456789012345678',
            name: 'general',
            rateLimitPerUser: 15,
            setRateLimitPerUser: async (secs, reason) => {
                rateLimitArgs = { secs, reason };
            },
            permissionsFor: () => ({
                has: () => true
            })
        };

        const mockBot = {
            sendError: async () => {}
        };

        const originalCustomId = 'mod:slowmode:reset:123456789012345678';
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: originalCustomId,
            user: { id: '999999999999999999', tag: 'Moderator#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            },
            deferUpdate: async () => {
                deferredUpdateCalled = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(deferredUpdateCalled, true);
        assert.equal(rateLimitArgs.secs, 0);
        assert.match(rateLimitArgs.reason, /Quick Slowmode/);

        // 驗證原卡片已原地更新為解除狀態
        assert.ok(editedPayload);
        assert.equal(editedPayload.flags, MessageFlags.IsComponentsV2);
        const containerJson = editedPayload.components[0].toJSON();
        assert.equal(containerJson.accent_color, Colors.Success); // 綠色
        const containerStr = JSON.stringify(containerJson);
        assert.match(containerStr, /# 🚀 頻道流控已解除/);
        assert.match(containerStr, /無限制/);
        assert.match(containerStr, /開啟 5 秒慢速/);
    });

    it('successfully adjusts slowmode to 5s via set button and updates card in-place', async () => {
        let deferredUpdateCalled = false;
        let rateLimitArgs = null;
        let editedPayload = null;

        const mockChannel = {
            id: '123456789012345678',
            name: 'general',
            rateLimitPerUser: 60,
            setRateLimitPerUser: async (secs, reason) => {
                rateLimitArgs = { secs, reason };
            },
            permissionsFor: () => ({
                has: () => true
            })
        };

        const mockBot = {
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:set:123456789012345678:5',
            user: { id: '999999999999999999', tag: 'Moderator#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            },
            deferUpdate: async () => {
                deferredUpdateCalled = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(deferredUpdateCalled, true);
        assert.equal(rateLimitArgs.secs, 5);
        assert.ok(editedPayload);

        const containerJson = editedPayload.components[0].toJSON();
        assert.equal(containerJson.accent_color, 0xe67e22); // 警戒橙
        const containerStr = JSON.stringify(containerJson);
        assert.match(containerStr, /# 🛡️ 頻道流控管制生效/);
        assert.match(containerStr, /5 秒/);
        // 按鈕自適應轉為 15 秒
        assert.match(containerStr, /快速調為 15 秒/);
    });

    it('falls back to bot.sendSuccess when interaction does not support in-place deferUpdate', async () => {
        let sentSuccess = null;
        const mockChannel = {
            id: '123456789012345678',
            name: 'general',
            rateLimitPerUser: 10,
            setRateLimitPerUser: async () => {},
            permissionsFor: () => ({
                has: () => true
            })
        };

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            user: { id: '999999999999999999', tag: 'Moderator#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);

        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /慢速模式已解除/);
        assert.equal(sentSuccess.ephemeral, true);
    });

    it('catches and reports unexpected exceptions cleanly', async () => {
        let sentError = null;
        const mockChannel = {
            id: '123456789012345678',
            rateLimitPerUser: 10,
            setRateLimitPerUser: async () => {
                throw new Error('REST API socket error');
            },
            permissionsFor: () => ({
                has: () => true
            })
        };

        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:slowmode:reset:123456789012345678',
            user: { tag: 'Moderator#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot_id' }
                },
                channels: {
                    cache: new Map([['123456789012345678', mockChannel]])
                }
            },
            deferUpdate: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /調整頻道慢速模式時出了點問題/);
    });
});
