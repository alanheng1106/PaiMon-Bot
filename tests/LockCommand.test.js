import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, PermissionsBitField, MessageFlags } = require('discord.js');

// Import compiled or transpile
const lockCommand = require('../src/commands/admin/lock').default || require('../src/commands/admin/lock');
const unlockCommand = require('../src/commands/admin/unlock').default || require('../src/commands/admin/unlock');

describe('Lock & Unlock Admin Commands', () => {
    it('has correct slash command configuration for lock', () => {
        assert.equal(lockCommand.data.name, 'lock');
        assert.equal(lockCommand.data.dm_permission, false);
        assert.equal(lockCommand.data.default_member_permissions, PermissionFlagsBits.ManageChannels.toString());
        assert.equal(lockCommand.category, 'admin');
        const reasonOption = lockCommand.data.options.find((opt) => opt.name === 'reason');
        assert.ok(reasonOption);
    });

    it('has correct slash command configuration for unlock', () => {
        assert.equal(unlockCommand.data.name, 'unlock');
        assert.equal(unlockCommand.data.dm_permission, false);
        assert.equal(unlockCommand.data.default_member_permissions, PermissionFlagsBits.ManageChannels.toString());
        assert.equal(unlockCommand.category, 'admin');
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

        await lockCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution in a thread channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            channel: {
                isThread: () => true
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /討論串/);
    });

    it('rejects when bot lacks ManageRoles permission', async () => {
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
                    me: { id: 'bot-id' }
                }
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: { cache: new Map(), edit: async () => {} },
                permissionsFor: () => new PermissionsBitField(0n) // no permissions
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理身分組與權限/);
    });

    it('rejects when channel is already locked', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const overwritesCache = new Map();
        overwritesCache.set('guild-id', {
            deny: new PermissionsBitField(PermissionsBitField.Flags.SendMessages)
        });

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                }
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: { cache: overwritesCache, edit: async () => {} },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道已鎖定');
    });

    it('locks channel and thread permissions and defers reply', async () => {
        let deferred = false;
        let editedOverwrites = null;
        let sentSuccess = null;

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };
        const overwritesCache = new Map();

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                roles: { cache: new Map() },
                members: {
                    me: { id: 'bot-id' }
                }
            },
            options: {
                getString: () => 'Raid protection'
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async (id, perms, options) => {
                        editedOverwrites = { id, perms, options };
                    }
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(editedOverwrites);
        assert.equal(editedOverwrites.id, 'guild-id');
        assert.equal(editedOverwrites.perms.SendMessages, false);
        assert.equal(editedOverwrites.perms.SendMessagesInThreads, false);
        assert.equal(editedOverwrites.perms.CreatePublicThreads, false);
        assert.equal(editedOverwrites.perms.CreatePrivateThreads, false);
        assert.ok(sentSuccess);
        assert.match(sentSuccess.desc, /Raid protection/);
    });

    it('locks channel and delivers Scheme B actionable CV2 card via editReply', async () => {
        let deferred = false;
        let editedOverwrites = null;
        let editedReply = null;

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async () => {}
        };
        const overwritesCache = new Map();

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: '999999999999999999', tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                name: 'Test Server',
                iconURL: () => 'https://cdn.discordapp.com/icons/guild.png',
                roles: { cache: new Map() },
                members: {
                    me: { id: 'bot-id' }
                }
            },
            options: {
                getString: () => 'Raid protection'
            },
            channel: {
                id: '111111111111111111',
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async (id, perms, options) => {
                        editedOverwrites = { id, perms, options };
                    }
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedReply = payload;
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(editedReply);
        assert.ok(editedReply.flags & MessageFlags.IsComponentsV2);
        const containerJson = editedReply.components[0].toJSON();

        // Dimension 1: Accent color is alert orange 0xe67e22
        assert.equal(containerJson.accent_color, 0xe67e22);

        // Dimension 2: Heading 1 title
        assert.match(containerJson.components[0].content, /^# 🛡️ 頻道安全管制生效/);

        // Dimension 3: Full-width clean target channel & reason (no redundant name, no avatar)
        const channelDisplay = containerJson.components.find(
            (c) => c.content && c.content.includes('<#111111111111111111>')
        );
        assert.ok(channelDisplay);
        assert.match(channelDisplay.content, /@everyone/);
        assert.equal(channelDisplay.content.includes('#general'), false);
        const reasonDisplay = containerJson.components.find((c) => c.content && c.content.includes('Raid protection'));
        assert.ok(reasonDisplay);
        assert.match(reasonDisplay.content, /\*\*鎖定原因\*\*：Raid protection/);
        assert.equal(reasonDisplay.content.startsWith('>'), false);

        // Dimension 4 & 5: ActionRow with Quick Unlock button
        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components[0].custom_id, 'mod:unlock:111111111111111111');
        assert.equal(actionRow.components[0].label, '解除頻道鎖定');

        // Subtext footer with executor and timestamp
        const footer = containerJson.components[containerJson.components.length - 1];
        assert.match(footer.content, /-# 執行人員：<@999999999999999999>/);
    });

    it('renders vulnerability warning when extra non-admin roles have SendMessages allowed', async () => {
        let editedReply = null;
        const mockBot = {
            sendError: async () => {}
        };
        const overwritesCache = new Map();
        overwritesCache.set('role-vip', {
            type: 0, // OverwriteType.Role
            id: 'role-vip',
            allow: new PermissionsBitField(PermissionsBitField.Flags.SendMessages)
        });

        const rolesCache = new Map();
        rolesCache.set('role-vip', {
            name: 'VIP',
            permissions: new PermissionsBitField(0n)
        });

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: '999999999999999999', tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                name: 'Test Server',
                iconURL: () => null,
                roles: { cache: rolesCache },
                members: {
                    me: { id: 'bot-id' }
                }
            },
            options: {
                getString: () => 'Spam incident'
            },
            channel: {
                id: '111111111111111111',
                name: 'chat',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async () => {}
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {},
            editReply: async (payload) => {
                editedReply = payload;
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.ok(editedReply);
        const containerJson = editedReply.components[0].toJSON();
        const warning = containerJson.components.find((c) => c.content && c.content.includes('覆寫例外'));
        assert.ok(warning);
        assert.match(warning.content, /VIP/);
    });

    it('unlocks channel and thread permissions and defers reply', async () => {
        let deferred = false;
        let editedOverwrites = null;
        let sentSuccess = null;

        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };
        const overwritesCache = new Map();
        overwritesCache.set('guild-id', {
            deny: new PermissionsBitField(PermissionsBitField.Flags.SendMessages)
        });

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                members: {
                    me: { id: 'bot-id' }
                }
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async (id, perms, options) => {
                        editedOverwrites = { id, perms, options };
                    }
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await unlockCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(editedOverwrites);
        assert.equal(editedOverwrites.id, 'guild-id');
        assert.equal(editedOverwrites.perms.SendMessages, null);
        assert.equal(editedOverwrites.perms.SendMessagesInThreads, null);
        assert.equal(editedOverwrites.perms.CreatePublicThreads, null);
        assert.equal(editedOverwrites.perms.CreatePrivateThreads, null);
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /解鎖/);
    });

    it('delivers Scheme B Actionable Security Console card via editReply in unlock', async () => {
        let editedPayload = null;
        const overwritesCache = new Map();
        overwritesCache.set('guild-id', {
            deny: new PermissionsBitField(PermissionsBitField.Flags.SendMessages)
        });

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'mod-123', tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                members: { me: { id: 'bot-id' } }
            },
            channel: {
                id: '123456789012345678',
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async () => {}
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {},
            editReply: async (payload) => {
                editedPayload = payload;
            }
        };

        await unlockCommand.execute(mockInteraction, {});
        assert.ok(editedPayload);
        assert.ok(editedPayload.flags & MessageFlags.IsComponentsV2);
        const containerJson = editedPayload.components[0].toJSON();
        assert.match(containerJson.components[0].content, /^# 🔓 頻道安全管制解除/);
        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components[0].custom_id, 'mod:lock:123456789012345678');
        assert.equal(actionRow.components[0].label, '再次鎖定頻道');
    });

    it('executes unlock cleanly on channel with prototype method accessing this', async () => {
        let sentSuccess = null;
        const mockBot = {
            sendError: async () => {},
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };
        class MockChannel {
            constructor() {
                this.type = 0;
                this.name = 'general';
                this.permissionOverwrites = {
                    cache: new Map([
                        ['guild-id', { deny: new PermissionsBitField(PermissionsBitField.Flags.SendMessages) }]
                    ]),
                    edit: async () => {}
                };
            }
            isThread() {
                return this.type === 11;
            }
            permissionsFor() {
                return new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]);
            }
        }
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                members: { me: { id: 'bot-id' } }
            },
            channel: new MockChannel(),
            deferReply: async () => {}
        };

        await unlockCommand.execute(mockInteraction, mockBot);
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /解鎖/);
    });

    it('handles permissionOverwrites.edit failure cleanly without deleting reply in unlock', async () => {
        let deleted = false;
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            sendSuccess: async () => {}
        };
        const overwritesCache = new Map();
        overwritesCache.set('guild-id', {
            deny: new PermissionsBitField(PermissionsBitField.Flags.SendMessages)
        });

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Moderator#0001' },
            guild: {
                id: 'guild-id',
                members: { me: { id: 'bot-id' } }
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: overwritesCache,
                    edit: async () => {
                        throw new Error('DiscordAPIError[50013]: Missing Permissions');
                    }
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {},
            deleteReply: async () => {
                deleted = true;
            }
        };

        await unlockCommand.execute(mockInteraction, mockBot);
        assert.equal(deleted, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
    });

    it('handles permissionOverwrites.edit failure cleanly without deleting reply in lock', async () => {
        let deleted = false;
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            sendSuccess: async () => {}
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Moderator#0001' },
            options: { getString: () => 'reason' },
            guild: {
                id: 'guild-id',
                roles: { cache: new Map() },
                members: { me: { id: 'bot-id' } }
            },
            channel: {
                name: 'general',
                isThread: () => false,
                permissionOverwrites: {
                    cache: new Map(),
                    edit: async () => {
                        throw new Error('DiscordAPIError[50013]: Missing Permissions');
                    }
                },
                permissionsFor: () =>
                    new PermissionsBitField([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
            },
            deferReply: async () => {},
            deleteReply: async () => {
                deleted = true;
            }
        };

        await lockCommand.execute(mockInteraction, mockBot);
        assert.equal(deleted, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
    });
});
