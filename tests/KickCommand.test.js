import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const kickCommand = require('../src/commands/admin/kick').default || require('../src/commands/admin/kick');

describe('Kick Admin Command (Scheme B Integration)', () => {
    it('has correct slash command configuration', () => {
        assert.equal(kickCommand.data.name, 'kick');
        assert.equal(kickCommand.data.dm_permission, false);
        assert.equal(kickCommand.data.default_member_permissions, PermissionFlagsBits.KickMembers.toString());
        assert.equal(kickCommand.category, 'admin');

        const userOption = kickCommand.data.options.find((opt) => opt.name === 'user');
        assert.ok(userOption);
        assert.equal(userOption.required, true);

        const reasonOption = kickCommand.data.options.find((opt) => opt.name === 'reason');
        assert.ok(reasonOption);
        assert.equal(reasonOption.required, false);
    });

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

        await kickCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects execution when bot lacks KickMembers permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => false
                        }
                    }
                }
            },
            options: {
                getUser: () => ({ id: '111', tag: 'user#0001' }),
                getString: () => '測試'
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /踢出成員/);
    });

    it('rejects execution synchronously before deferReply when targeting self', async () => {
        let sentError = null;
        let deferred = false;
        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    }
                }
            },
            options: {
                getUser: () => ({ id: 'admin_id', tag: 'admin#0001' }),
                getString: () => '測試'
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /你自己/);
    });

    it('rejects execution when targeting the bot itself', async () => {
        let sentError = null;
        let deferred = false;
        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    }
                }
            },
            options: {
                getUser: () => ({ id: 'bot_id', tag: 'bot#0001' }),
                getString: () => '測試'
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /我自己/);
    });

    it('rejects execution when targeting guild owner', async () => {
        let sentError = null;
        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    }
                }
            },
            options: {
                getUser: () => ({ id: 'owner_id', tag: 'owner#0001' }),
                getString: () => '測試'
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /伺服器擁有者/);
    });

    it('defers reply and rejects when target member is not found', async () => {
        let sentError = null;
        let deferred = false;
        let replyDeleted = false;

        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => null
                }
            },
            options: {
                getUser: () => ({ id: 'missing_user_id', tag: 'missing#0001' }),
                getString: () => '測試'
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                replyDeleted = true;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(replyDeleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無成員');
    });

    it('defers reply and rejects when member is not kickable', async () => {
        let sentError = null;
        let replyDeleted = false;

        const targetUser = {
            id: 'high_role_user',
            tag: 'high#0001',
            username: 'high'
        };

        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            member: { roles: { highest: { position: 10 } } },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        kickable: false,
                        roles: { highest: { position: 5 } }
                    })
                }
            },
            options: {
                getUser: () => targetUser,
                getString: () => '測試'
            },
            deferReply: async () => {},
            deleteReply: async () => {
                replyDeleted = true;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.equal(replyDeleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限溢位');
        assert.match(sentError.desc, /我踢不動這個人/);
    });

    it('notifies target via DM, kicks member, and replies with Scheme B Actionable Kick Card', async () => {
        let deferred = false;
        let dmSent = null;
        let kickReason = null;
        let editedPayload = null;

        const targetUser = {
            id: '123456789012345678',
            tag: 'violator#1234',
            username: 'violator',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
            send: async (msg) => {
                dmSent = msg;
            }
        };

        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: {
                id: '999999999999999999',
                tag: 'admin#0001',
                username: 'admin'
            },
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: '測試伺服器',
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        kickable: true,
                        roles: { highest: { position: 2 } },
                        kick: async (r) => {
                            kickReason = r;
                        }
                    })
                }
            },
            options: {
                getUser: () => targetUser,
                getString: () => '多次違規騷擾'
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(dmSent);
        assert.match(dmSent, /已被 \*\*測試伺服器\*\* 踢出/);
        assert.match(kickReason, /By admin#0001: 多次違規騷擾/);

        // Verify Scheme B visual payload
        assert.ok(editedPayload);
        assert.ok(editedPayload.flags & MessageFlags.IsComponentsV2);
        const containerJson = editedPayload.components[0].toJSON();

        // Accent Color is warm alert orange (0xe67e22)
        assert.equal(containerJson.accent_color, 0xe67e22);

        // Title has boot & Scheme B action title (Heading 1)
        assert.match(containerJson.components[0].content, /^# 👢 成員踢出處分/);

        // Section has target user mention, tag, and account creation timestamp
        const section = containerJson.components.find((c) => c.type === 9);
        assert.ok(section);
        assert.match(section.components[0].content, /<@123456789012345678>/);
        assert.match(section.components[0].content, /violator/);
        assert.match(section.components[2].content, /\*\*處分事由\*\*：多次違規騷擾/);
        assert.equal(section.components[2].content.startsWith('>'), false);

        // ActionRow contains both Upgrade to Ban (mod:ban) and History (mod:history) buttons
        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components.length, 2);

        // Button 1: Upgrade to Ban
        assert.equal(actionRow.components[0].custom_id, 'mod:ban:123456789012345678');
        assert.equal(actionRow.components[0].label, '升級為封鎖');
        assert.equal(actionRow.components[0].style, 4); // Danger

        // Button 2: History
        assert.equal(actionRow.components[1].custom_id, 'mod:history:123456789012345678');
        assert.equal(actionRow.components[1].label, '處分記錄');
        assert.equal(actionRow.components[1].style, 2); // Secondary

        // Footer subtext
        const footer = containerJson.components[5];
        assert.match(footer.content, /-# 執行人員：<@999999999999999999>  •  處分時間：<t:\d+:R>/);
    });

    it('handles unexpected exceptions cleanly with abortWithError', async () => {
        let sentError = null;
        let replyDeleted = false;

        const targetUser = {
            id: 'target_id',
            tag: 'target#0001',
            username: 'target'
        };

        const mockBot = {
            user: { id: 'bot_id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin_id' },
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: 'Guild',
                ownerId: 'owner_id',
                members: {
                    me: { permissions: { has: () => true } },
                    fetch: async () => ({
                        kickable: true,
                        roles: { highest: { position: 2 } },
                        kick: async () => {
                            throw new Error('Discord API Kick Error');
                        }
                    })
                }
            },
            options: {
                getUser: () => targetUser,
                getString: () => 'Test'
            },
            deferReply: async () => {},
            deleteReply: async () => {
                replyDeleted = true;
            }
        };

        await kickCommand.execute(mockInteraction, mockBot);
        assert.equal(replyDeleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /稍後再試/);
    });
});
