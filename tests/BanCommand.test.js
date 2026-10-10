import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const banCommand = require('../src/commands/admin/ban').default || require('../src/commands/admin/ban');

describe('Ban Admin Command (Scheme B Integration)', () => {
    it('has correct slash command configuration', () => {
        assert.equal(banCommand.data.name, 'ban');
        assert.equal(banCommand.data.dm_permission, false);
        assert.equal(banCommand.data.default_member_permissions, PermissionFlagsBits.BanMembers.toString());
        assert.equal(banCommand.category, 'admin');

        const userOption = banCommand.data.options.find((opt) => opt.name === 'user');
        assert.ok(userOption);
        assert.equal(userOption.required, true);

        const reasonOption = banCommand.data.options.find((opt) => opt.name === 'reason');
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

        await banCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
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

        await banCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /封鎖成員/);
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
                        permissions: {
                            has: () => true
                        }
                    }
                }
            },
            options: {
                getUser: () => ({ id: 'admin_id', tag: 'admin#0001' }),
                getString: () => 'Self ban test'
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await banCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /不能對你自己/);
    });

    it('rejects execution when target member is not bannable', async () => {
        let sentError = null;
        let replyDeleted = false;
        let deferred = false;

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
            user: { id: 'admin_id', tag: 'admin#0001' },
            member: {
                roles: { highest: { position: 10 } }
            },
            guild: {
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        bannable: false,
                        roles: { highest: { position: 5 } }
                    })
                }
            },
            options: {
                getUser: () => targetUser,
                getString: () => 'Test reason'
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                replyDeleted = true;
            }
        };

        await banCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(replyDeleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限溢位');
        assert.match(sentError.desc, /我封鎖不了這個人/);
    });

    it('defers reply, sends DM, executes ban, and delivers Scheme B actionable card', async () => {
        let deferred = false;
        let dmSent = null;
        let bannedTarget = null;
        let banOptions = null;
        let editedPayload = null;

        const targetUser = {
            id: '123456789012345678',
            username: 'spammer',
            tag: 'spammer#0001',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
            send: async (msg) => {
                dmSent = msg;
            }
        };

        const mockBot = {
            user: { id: 'bot_id' }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: '987654321098765432', username: 'admin', tag: 'admin#0001' },
            member: {
                roles: { highest: { position: 10 } }
            },
            guild: {
                name: '測試伺服器',
                ownerId: 'owner_id',
                members: {
                    me: {
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        bannable: true,
                        roles: { highest: { position: 2 } }
                    }),
                    ban: async (user, opt) => {
                        bannedTarget = user;
                        banOptions = opt;
                    }
                }
            },
            options: {
                getUser: () => targetUser,
                getString: () => '惡意洗版廣告'
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await banCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(dmSent);
        assert.match(dmSent, /已被 \*\*測試伺服器\*\* 封鎖/);
        assert.equal(bannedTarget.id, targetUser.id);
        assert.match(banOptions.reason, /By admin#0001: 惡意洗版廣告/);

        // Verify Scheme B visual payload
        assert.ok(editedPayload);
        assert.ok(editedPayload.flags & MessageFlags.IsComponentsV2);
        const containerJson = editedPayload.components[0].toJSON();

        // Title has hammer & Scheme B action title (Heading 1)
        assert.match(containerJson.components[0].content, /^# 🔨 成員封鎖處分/);

        // Section has target user mention & registration timestamp
        const section = containerJson.components.find((c) => c.type === 9);
        assert.ok(section);
        assert.match(section.components[0].content, /<@123456789012345678>/);
        assert.match(section.components[1].content, /帳號建立於 <t:1700000000:R>/);

        // ActionRow contains both Unban (mod:unban) and History (mod:history) buttons
        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components.length, 2);
        assert.equal(actionRow.components[0].custom_id, 'mod:unban:123456789012345678');
        assert.equal(actionRow.components[1].custom_id, 'mod:history:123456789012345678');
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
                        bannable: true,
                        roles: { highest: { position: 2 } }
                    }),
                    ban: async () => {
                        throw new Error('Discord API Ban Error');
                    }
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

        await banCommand.execute(mockInteraction, mockBot);
        assert.equal(replyDeleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /稍後再試/);
    });
});
