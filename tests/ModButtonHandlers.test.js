import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const ModUnbanButtonHandler =
    require('../src/core/components/ModUnbanButtonHandler').default ||
    require('../src/core/components/ModUnbanButtonHandler');

const ModBanButtonHandler =
    require('../src/core/components/ModBanButtonHandler').default ||
    require('../src/core/components/ModBanButtonHandler');

const ModHistoryButtonHandler =
    require('../src/core/components/ModHistoryButtonHandler').default ||
    require('../src/core/components/ModHistoryButtonHandler');

const ModUnlockButtonHandler =
    require('../src/core/components/ModUnlockButtonHandler').default ||
    require('../src/core/components/ModUnlockButtonHandler');

const ModLockButtonHandler =
    require('../src/core/components/ModLockButtonHandler').default ||
    require('../src/core/components/ModLockButtonHandler');

const ComponentRouter =
    require('../src/core/components/ComponentRouter').default || require('../src/core/components/ComponentRouter');

describe('ModUnbanButtonHandler (Defensive Rollback)', () => {
    const handler = new ModUnbanButtonHandler();

    it('matches customId prefix mod:unban:<userId>', () => {
        assert.equal(handler.customId, 'mod:unban');
        assert.equal(handler.matches('mod:unban:123456789012345678'), true);
        assert.equal(handler.matches('mod:unban'), true);
        assert.equal(handler.matches('mod:history:123456789012345678'), false);
        assert.equal(handler.matches('other_btn'), false);
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
            customId: 'mod:unban:123456789012345678'
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
            customId: 'mod:unban:abc-not-an-id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
    });

    it('rejects execution when member lacks BanMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unban:123456789012345678',
            memberPermissions: {
                has: (perm) => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /封鎖成員/);
    });

    it('rejects execution when bot lacks BanMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unban:123456789012345678',
            memberPermissions: {
                has: (perm) => true
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => false
                        }
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /我缺少「封鎖成員」/);
    });

    it('rejects when target user is not in guild bans', async () => {
        let sentError = null;
        let deferred = false;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unban:123456789012345678',
            memberPermissions: {
                has: (perm) => true
            },
            guild: {
                members: {
                    me: {
                        permissions: { has: (perm) => true }
                    }
                },
                bans: {
                    fetch: async () => null
                }
            },
            deferReply: async (opt) => {
                deferred = true;
                assert.ok(opt.flags & MessageFlags.Ephemeral);
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '未在封鎖名單');
        assert.match(sentError.desc, /未在伺服器的封鎖名單中/);
    });

    it('defers, unbans target member, updates button and sends success', async () => {
        let deferred = false;
        let unbannedId = null;
        let sentSuccess = null;
        let messageEdited = false;
        let repliedPayload = null;

        const mockBot = {
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            },
            sendError: async (interaction, title, desc) => {
                throw new Error(`Unexpected error: ${title} - ${desc}`);
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unban:123456789012345678',
            user: { tag: 'admin#0001' },
            deferred: false,
            replied: false,
            memberPermissions: {
                has: (perm) => true
            },
            guild: {
                members: {
                    me: {
                        permissions: { has: (perm) => true }
                    },
                    unban: async (id, reason) => {
                        unbannedId = id;
                        assert.match(reason, /處分卡片快捷撤銷封鎖/);
                    }
                },
                bans: {
                    fetch: async () => ({
                        user: { id: '123456789012345678', tag: 'banned#1234' }
                    })
                }
            },
            message: {
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                custom_id: 'mod:unban:123456789012345678',
                                label: '撤銷封鎖 (Unban)',
                                style: 4
                            }
                        ]
                    }
                ],
                edit: async () => {
                    messageEdited = true;
                }
            },
            deferReply: async () => {
                mockInteraction.deferred = true;
                deferred = true;
            },
            editReply: async (payload) => {
                repliedPayload = payload;
            },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(unbannedId, '123456789012345678');
        assert.equal(messageEdited, true);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.flags & MessageFlags.Ephemeral);
        assert.ok(repliedPayload.flags & MessageFlags.IsComponentsV2);
        const json = repliedPayload.components[0].toJSON();
        assert.match(json.components[0].content, /^# 🔓 解除封鎖成功/);
        const section = json.components.find((c) => c.type === 9);
        assert.ok(section);
        assert.match(section.components[0].content, /banned#1234/);
    });

    it('disables button correctly inside CV2 Container (type 17)', async () => {
        let editedComponents = null;

        const mockBot = {
            sendError: async (interaction, title, desc) => {
                throw new Error(`Unexpected error: ${title} - ${desc}`);
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unban:123456789012345678',
            user: { tag: 'admin#0001' },
            deferred: false,
            replied: false,
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { permissions: { has: () => true } },
                    unban: async () => {}
                },
                bans: {
                    fetch: async () => ({
                        user: { id: '123456789012345678', tag: 'banned#1234' }
                    })
                }
            },
            message: {
                components: [
                    {
                        type: 17,
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        custom_id: 'mod:unban:123456789012345678',
                                        label: '撤銷封鎖',
                                        style: 4,
                                        disabled: false
                                    },
                                    {
                                        custom_id: 'mod:history:123456789012345678',
                                        label: '處分記錄',
                                        style: 2,
                                        disabled: false
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async ({ components }) => {
                    editedComponents = components;
                }
            },
            deferReply: async () => {
                mockInteraction.deferred = true;
            },
            editReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(editedComponents);
        assert.equal(editedComponents.length, 1);
        const containerJson = editedComponents[0].toJSON();
        assert.equal(containerJson.type, 17);
        const row = containerJson.components[0];
        assert.equal(row.type, 1);
        const unbanBtn = row.components[0];
        assert.equal(unbanBtn.disabled, true);
        assert.equal(unbanBtn.label, '已撤銷封鎖');
        assert.equal(unbanBtn.style, 2); // Secondary
        const histBtn = row.components[1];
        assert.equal(histBtn.disabled, false);
    });
});

describe('ModHistoryButtonHandler (Ephemeral Audit Query)', () => {
    const handler = new ModHistoryButtonHandler();

    it('matches customId prefix mod:history:<userId>', () => {
        assert.equal(handler.customId, 'mod:history');
        assert.equal(handler.matches('mod:history:123456789012345678'), true);
        assert.equal(handler.matches('mod:history'), true);
        assert.equal(handler.matches('mod:unban:123456789012345678'), false);
    });

    it('rejects execution when member lacks permissions', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:history:123456789012345678',
            memberPermissions: {
                has: () => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理成員/);
    });

    it('returns empty message when user has no warning records', async () => {
        let repliedPayload = null;
        const mockBot = {
            settings: {
                get: () => ({})
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:history:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild_1' },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.flags & MessageFlags.Ephemeral);
        assert.ok(repliedPayload.flags & MessageFlags.IsComponentsV2);

        const containerJson = repliedPayload.components[0].toJSON();
        // Title has scroll icon & real H1 heading
        assert.match(containerJson.components[0].content, /^# 📜 處分歷史記錄/);
        assert.equal(containerJson.components[1].type, 14); // Divider
        const timeline = containerJson.components.find((c) => c.content?.includes('歷史警告記錄'));
        assert.ok(timeline);
        assert.match(timeline.content, /沒有任何警告處分記錄/);
    });

    it('displays warning entries ephemerally when records exist', async () => {
        let repliedPayload = null;
        const mockBot = {
            settings: {
                get: () => ({
                    '123456789012345678': [
                        { reason: '不當言論', timestamp: new Date().toISOString(), by: 'Admin#0001' },
                        { reason: '惡意刷頻', timestamp: new Date().toISOString(), by: 'Admin#0002' }
                    ]
                })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:history:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild_1' },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.flags & MessageFlags.Ephemeral);

        const containerJson = repliedPayload.components[0].toJSON();
        assert.match(containerJson.components[0].content, /^# 📜 處分歷史記錄/);
        const timeline = containerJson.components.find((c) => c.content?.includes('歷史警告記錄'));
        assert.ok(timeline);
        assert.match(timeline.content, /不當言論/);
        assert.match(timeline.content, /惡意刷頻/);
        assert.match(timeline.content, /累計警告共 2 次/);
    });
});

describe('ModBanButtonHandler (Upgrade Kick to Ban)', () => {
    const handler = new ModBanButtonHandler();

    it('matches customId prefix mod:ban:<userId>', () => {
        assert.equal(handler.customId, 'mod:ban');
        assert.equal(handler.matches('mod:ban:123456789012345678'), true);
        assert.equal(handler.matches('mod:ban'), true);
        assert.equal(handler.matches('mod:unban:123456789012345678'), false);
        assert.equal(handler.matches('mod:history:123456789012345678'), false);
        assert.equal(handler.matches('other_btn'), false);
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
            customId: 'mod:ban:123456789012345678'
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
            customId: 'mod:ban:abc-not-an-id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /有效的使用者 ID/);
    });

    it('rejects when clicking member lacks BanMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:ban:123456789012345678',
            memberPermissions: {
                has: (perm) => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /你需要「封鎖成員」/);
    });

    it('rejects when bot lacks BanMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:ban:123456789012345678',
            memberPermissions: {
                has: (perm) => perm === PermissionFlagsBits.BanMembers
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => false
                        }
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /我缺少「封鎖成員」/);
    });

    it('defers reply and executes ban upgrade successfully', async () => {
        let deferred = false;
        let deferFlags = null;
        let banCalledWith = null;
        let messageEdited = false;
        let replyPayload = null;

        const mockTargetUser = {
            id: '123456789012345678',
            username: 'upgraded_user',
            tag: 'upgraded_user#1234',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:ban:123456789012345678',
            user: {
                id: '999999999999999999',
                username: 'mod_user',
                tag: 'mod_user#0001'
            },
            memberPermissions: {
                has: (perm) => perm === PermissionFlagsBits.BanMembers
            },
            guild: {
                name: 'Test Guild',
                members: {
                    me: {
                        permissions: {
                            has: (perm) => true
                        }
                    },
                    fetch: async (id) => null,
                    ban: async (id, opts) => {
                        banCalledWith = { id, opts };
                    }
                }
            },
            client: {
                users: {
                    fetch: async (id) => mockTargetUser
                }
            },
            message: {
                components: [
                    {
                        toJSON: () => ({
                            type: 17,
                            components: [
                                {
                                    toJSON: () => ({
                                        type: 1,
                                        components: [
                                            {
                                                custom_id: 'mod:ban:123456789012345678',
                                                label: '升級為封鎖',
                                                style: 4
                                            },
                                            {
                                                custom_id: 'mod:history:123456789012345678',
                                                label: '處分記錄',
                                                style: 2
                                            }
                                        ]
                                    })
                                }
                            ]
                        })
                    }
                ],
                edit: async (opts) => {
                    messageEdited = true;
                }
            },
            deferReply: async ({ flags }) => {
                deferred = true;
                deferFlags = flags;
            },
            deferred: true,
            replied: false,
            editReply: async (payload) => {
                replyPayload = payload;
            }
        };

        const mockBot = {
            sendError: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(deferFlags, MessageFlags.Ephemeral);
        assert.ok(banCalledWith);
        assert.equal(banCalledWith.id, '123456789012345678');
        assert.match(banCalledWith.opts.reason, /處分卡片快捷升級為封鎖/);
        assert.equal(messageEdited, true);
        assert.ok(replyPayload);
        assert.ok(replyPayload.flags & MessageFlags.Ephemeral);

        const cardJson = replyPayload.components[0].toJSON();
        assert.equal(cardJson.accent_color, 0xda373c);
        assert.match(cardJson.components[0].content, /^# 🔨 成員封鎖處分 \(升級生效\)/);
    });

    it('handles exceptions in guild.members.ban cleanly', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:ban:123456789012345678',
            user: { id: '999', tag: 'admin' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => null,
                    ban: async () => {
                        throw new Error('Discord API Ban Failure');
                    }
                }
            },
            client: {
                users: {
                    fetch: async () => null
                }
            },
            deferReply: async () => {},
            deferred: true
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /出了點問題/);
    });
});

describe('ModUnlockButtonHandler (Quick Unlock)', () => {
    const handler = new ModUnlockButtonHandler();

    it('matches customId prefix mod:unlock:<channelId>', () => {
        assert.equal(handler.customId, 'mod:unlock');
        assert.equal(handler.matches('mod:unlock:123456789012345678'), true);
        assert.equal(handler.matches('mod:unlock'), true);
        assert.equal(handler.matches('mod:unban:123456789012345678'), false);
        assert.equal(handler.matches('other_btn'), false);
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
            customId: 'mod:unlock:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects invalid snowflake channel ID', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unlock:not-a-valid-id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
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
            customId: 'mod:unlock:123456789012345678',
            memberPermissions: {
                has: (perm) => perm !== PermissionFlagsBits.ManageChannels
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理頻道/);
    });

    it('rejects execution when channel is not found or is thread', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unlock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                channels: {
                    fetch: async () => null
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無頻道');
    });

    it('rejects execution when bot lacks ManageRoles in target channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unlock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        isThread: () => false,
                        permissionOverwrites: { cache: new Map() },
                        permissionsFor: () => ({
                            has: (perm) => perm !== PermissionFlagsBits.ManageRoles
                        })
                    })
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理身分組與權限/);
    });

    it('rejects execution when channel is not currently locked', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unlock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        isThread: () => false,
                        permissionOverwrites: {
                            cache: new Map([['guild-id', { deny: { has: () => false } }]])
                        },
                        permissionsFor: () => ({
                            has: () => true
                        })
                    })
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道未鎖定');
    });

    it('executes unlock successfully, updates button on message, and sends success response', async () => {
        let deferredFlags = null;
        let editedOverwrites = null;
        let messageEdited = null;
        let sentSuccess = null;

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:unlock:123456789012345678',
            user: { tag: 'Admin#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        name: 'chat',
                        isThread: () => false,
                        permissionOverwrites: {
                            cache: new Map([['guild-id', { deny: { has: () => true } }]]),
                            edit: async (id, perms, options) => {
                                editedOverwrites = { id, perms, options };
                            }
                        },
                        permissionsFor: () => ({
                            has: () => true
                        })
                    })
                }
            },
            deferReply: async ({ flags }) => {
                deferredFlags = flags;
            },
            message: {
                components: [
                    {
                        type: 17,
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        custom_id: 'mod:unlock:123456789012345678',
                                        label: '解除頻道鎖定',
                                        style: 3,
                                        emoji: { name: '🔓' }
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async (payload) => {
                    messageEdited = payload;
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(deferredFlags & MessageFlags.Ephemeral);
        assert.ok(editedOverwrites);
        assert.equal(editedOverwrites.id, 'guild-id');
        assert.equal(editedOverwrites.perms.SendMessages, null);
        assert.ok(messageEdited);
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /解鎖/);
        assert.equal(sentSuccess.ephemeral, true);
    });
});

describe('ModLockButtonHandler (Quick Lock)', () => {
    const handler = new ModLockButtonHandler();

    it('matches customId prefix mod:lock:<channelId>', () => {
        assert.equal(handler.customId, 'mod:lock');
        assert.equal(handler.matches('mod:lock:123456789012345678'), true);
        assert.equal(handler.matches('mod:lock'), true);
        assert.equal(handler.matches('mod:unlock:123456789012345678'), false);
        assert.equal(handler.matches('other_btn'), false);
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
            customId: 'mod:lock:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects invalid snowflake channel ID', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:lock:bad-id'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
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
            customId: 'mod:lock:123456789012345678',
            memberPermissions: {
                has: (perm) => perm !== PermissionFlagsBits.ManageChannels
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
    });

    it('rejects execution when channel is not found', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:lock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                channels: {
                    fetch: async () => null
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無頻道');
    });

    it('rejects execution when bot lacks ManageRoles permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:lock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        isThread: () => false,
                        permissionOverwrites: {},
                        permissionsFor: () => ({
                            has: (perm) => perm !== PermissionFlagsBits.ManageRoles
                        })
                    })
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
    });

    it('rejects execution when channel is already locked', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:lock:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        isThread: () => false,
                        permissionOverwrites: {
                            cache: new Map([['guild-id', { deny: { has: () => true } }]])
                        },
                        permissionsFor: () => ({
                            has: () => true
                        })
                    })
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道已鎖定');
    });

    it('executes lock successfully, updates button on message, and sends success response', async () => {
        let deferredFlags = null;
        let editedOverwrites = null;
        let messageEdited = null;
        let sentSuccess = null;

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:lock:123456789012345678',
            user: { tag: 'Admin#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                },
                channels: {
                    fetch: async () => ({
                        id: '123456789012345678',
                        name: 'chat',
                        isThread: () => false,
                        permissionOverwrites: {
                            cache: new Map([['guild-id', { deny: { has: () => false } }]]),
                            edit: async (id, perms, options) => {
                                editedOverwrites = { id, perms, options };
                            }
                        },
                        permissionsFor: () => ({
                            has: () => true
                        })
                    })
                }
            },
            deferReply: async ({ flags }) => {
                deferredFlags = flags;
            },
            message: {
                components: [
                    {
                        type: 17,
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        custom_id: 'mod:lock:123456789012345678',
                                        label: '再次鎖定頻道',
                                        style: 2,
                                        emoji: { name: '🔒' }
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async (payload) => {
                    messageEdited = payload;
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(deferredFlags & MessageFlags.Ephemeral);
        assert.ok(editedOverwrites);
        assert.equal(editedOverwrites.id, 'guild-id');
        assert.equal(editedOverwrites.perms.SendMessages, false);
        assert.equal(editedOverwrites.perms.SendMessagesInThreads, false);
        assert.equal(editedOverwrites.perms.CreatePublicThreads, false);
        assert.equal(editedOverwrites.perms.CreatePrivateThreads, false);
        assert.ok(messageEdited);
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /鎖定/);
        assert.equal(sentSuccess.ephemeral, true);
    });
});

describe('ComponentRouter Integration with Prefix Handlers', () => {
    it('routes parameterized customId to registered handler', async () => {
        const router = new ComponentRouter();
        const unbanHandler = new ModUnbanButtonHandler();
        const banHandler = new ModBanButtonHandler();
        const historyHandler = new ModHistoryButtonHandler();
        const unlockHandler = new ModUnlockButtonHandler();
        const lockHandler = new ModLockButtonHandler();

        router.register(unbanHandler);
        router.register(banHandler);
        router.register(historyHandler);
        router.register(unlockHandler);
        router.register(lockHandler);

        assert.equal(router.has('mod:unban:123456789012345678'), true);
        assert.equal(router.has('mod:ban:123456789012345678'), true);
        assert.equal(router.has('mod:history:123456789012345678'), true);
        assert.equal(router.has('mod:unlock:123456789012345678'), true);
        assert.equal(router.has('mod:lock:123456789012345678'), true);
        assert.equal(router.has('non_existing_btn'), false);

        let unbanExecuted = false;
        const mockBot = {
            sendError: async () => {}
        };
        const mockInteraction = {
            inCachedGuild: () => false,
            customId: 'mod:unlock:123456789012345678'
        };

        const handled = await router.handle(mockInteraction, mockBot);
        assert.equal(handled, true);
    });
});
