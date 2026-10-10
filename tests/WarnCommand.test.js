import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits } = require('discord.js');

const warnCommand = require('../src/commands/admin/warn').default || require('../src/commands/admin/warn');

describe('Warn Admin Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(warnCommand.data.name, 'warn');
        assert.equal(warnCommand.data.dm_permission, false);
        assert.equal(warnCommand.data.default_member_permissions, PermissionFlagsBits.ModerateMembers.toString());
        assert.equal(warnCommand.category, 'admin');

        const userOption = warnCommand.data.options.find((opt) => opt.name === 'user');
        assert.ok(userOption);
        assert.equal(userOption.required, true);

        const reasonOption = warnCommand.data.options.find((opt) => opt.name === 'reason');
        assert.ok(reasonOption);
        assert.equal(reasonOption.required, true);
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

        await warnCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when target is a bot', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getUser: () => ({ id: '123456', tag: 'TestBot#0001', bot: true }),
                getString: () => '違反版規'
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /機器人/);
    });

    it('rejects execution synchronously before deferReply when targeting self', async () => {
        let sentError = null;
        let deferred = false;
        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            options: {
                getUser: () => ({ id: 'admin-id', tag: 'Admin#0001', bot: false }),
                getString: () => '自我警告'
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /你自己/);
    });

    it('defers reply and rejects when target member is not found', async () => {
        let sentError = null;
        let deferred = false;
        let deleted = false;

        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            options: {
                getUser: () => ({ id: 'target-id', tag: 'Target#0001', bot: false }),
                getString: () => '警告原因'
            },
            guild: {
                members: {
                    fetch: async () => null
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deleted = true;
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(deleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無成員');
    });

    it('defers reply and rejects when target member has higher role hierarchy', async () => {
        let sentError = null;
        let deferred = false;
        let deleted = false;

        const targetUser = { id: 'target-id', tag: 'Target#0001', bot: false };
        const targetMember = {
            id: 'target-id',
            roles: { highest: { position: 10 } }
        };

        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            member: { roles: { highest: { position: 5 } } },
            options: {
                getUser: () => targetUser,
                getString: () => '越權警告'
            },
            guild: {
                ownerId: 'owner-id',
                members: {
                    fetch: async () => targetMember
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deleted = true;
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(deleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /不高於/);
    });

    it('records warning, notifies target via DM, and edits reply successfully', async () => {
        let deferred = false;
        let editedPayload = null;
        let dmSentMessage = null;
        const storedSettings = {};

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false,
            send: async (msg) => {
                dmSentMessage = msg;
            },
            displayAvatarURL: () => 'https://example.com/avatar.png'
        };
        const targetMember = {
            id: 'target-id',
            roles: { highest: { position: 2 } }
        };

        const mockBot = {
            user: { id: 'bot-id' },
            settings: {
                get: (guildId, key) => storedSettings[guildId]?.[key] ?? null,
                set: (guildId, key, val) => {
                    if (!storedSettings[guildId]) storedSettings[guildId] = {};
                    storedSettings[guildId][key] = val;
                }
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            member: { roles: { highest: { position: 10 } } },
            options: {
                getUser: () => targetUser,
                getString: () => '刷屏騷擾'
            },
            guild: {
                id: 'guild-123',
                name: '測試伺服器',
                ownerId: 'owner-id',
                members: {
                    fetch: async () => targetMember
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(editedPayload);
        assert.ok(editedPayload.components);

        // Verify Scheme B CV2 card structure
        const containerJson = editedPayload.components[0].toJSON();
        assert.equal(containerJson.type, 17);
        assert.equal(containerJson.accent_color, 0xf1c40f);
        assert.match(containerJson.components[0].content, /^# <a:cross:1524603300752785550> 成員警告處分/);

        // Section with 3-line layout and meter
        const section = containerJson.components[2];
        assert.equal(section.type, 9);
        assert.match(section.components[0].content, /<@target-id>/);
        assert.match(section.components[2].content, /\*\*警告狀態\*\*：\[ <a:cross:1524603300752785550>⚪⚪ \] `1 次`/);

        // ActionRow contains mod:history button
        const actionRow = containerJson.components[5];
        assert.equal(actionRow.type, 1);
        assert.equal(actionRow.components[0].custom_id, 'mod:history:target-id');

        // Verify DM
        assert.ok(dmSentMessage);
        assert.match(dmSentMessage, /測試伺服器/);
        assert.match(dmSentMessage, /共 1 次/);
        assert.match(dmSentMessage, /刷屏騷擾/);

        // Verify stored settings
        const guildWarnings = storedSettings['guild-123']['warnings'];
        assert.ok(guildWarnings);
        assert.equal(guildWarnings['target-id'].length, 1);
        assert.equal(guildWarnings['target-id'][0].reason, '刷屏騷擾');
        assert.equal(guildWarnings['target-id'][0].by, 'Admin#0001');

        // Execute a second warning to verify accumulation
        await warnCommand.execute(mockInteraction, mockBot);
        assert.equal(storedSettings['guild-123']['warnings']['target-id'].length, 2);
        assert.match(dmSentMessage, /共 2 次/);

        // Execute a third warning to verify threshold escalation
        await warnCommand.execute(mockInteraction, mockBot);
        assert.equal(storedSettings['guild-123']['warnings']['target-id'].length, 3);
        const escalatedJson = editedPayload.components[0].toJSON();
        assert.equal(escalatedJson.accent_color, 0xed4245);
        assert.match(
            escalatedJson.components[2].components[2].content,
            /\[ (?:<a:cross:1524603300752785550>){3} \] `3 次` \(已達處分門檻\)/
        );
        assert.equal(escalatedJson.components[5].components.length, 2);
        assert.equal(escalatedJson.components[5].components[1].custom_id, 'mod:timeout:target-id:600');
    });

    it('catches and handles unexpected exceptions cleanly', async () => {
        let sentError = null;
        let deleted = false;

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false
        };
        const targetMember = {
            id: 'target-id',
            roles: { highest: { position: 1 } }
        };

        const mockBot = {
            user: { id: 'bot-id' },
            settings: {
                get: () => {
                    throw new Error('Database connection failed');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            member: { roles: { highest: { position: 10 } } },
            options: {
                getUser: () => targetUser,
                getString: () => '測試異常'
            },
            guild: {
                id: 'guild-123',
                name: '測試伺服器',
                ownerId: 'owner-id',
                members: {
                    fetch: async () => targetMember
                }
            },
            deferReply: async () => {},
            deleteReply: async () => {
                deleted = true;
            }
        };

        await warnCommand.execute(mockInteraction, mockBot);

        assert.equal(deleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /記錄警告時出了點問題/);
    });
});
