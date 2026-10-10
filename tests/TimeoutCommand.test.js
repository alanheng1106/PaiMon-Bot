import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits } = require('discord.js');

const timeoutCommand = require('../src/commands/admin/timeout').default || require('../src/commands/admin/timeout');

describe('Timeout Admin Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(timeoutCommand.data.name, 'timeout');
        assert.equal(timeoutCommand.data.dm_permission, false);
        assert.equal(timeoutCommand.data.default_member_permissions, PermissionFlagsBits.ModerateMembers.toString());
        assert.equal(timeoutCommand.category, 'admin');

        const durationOption = timeoutCommand.data.options.find((opt) => opt.name === 'duration');
        assert.ok(durationOption);
        assert.equal(durationOption.required, true);

        const choices = durationOption.choices;
        assert.ok(choices.some((c) => c.value === 0 && c.name.includes('解除禁言')));
        assert.ok(choices.some((c) => c.value === 60));
        assert.ok(choices.some((c) => c.value === 2419200));
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

        await timeoutCommand.execute(mockInteraction, mockBot);
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
                getInteger: () => 60,
                getString: () => 'test'
            }
        };

        await timeoutCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /機器人/);
    });

    it('rejects execution when bot lacks ModerateMembers permission', async () => {
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
                getUser: () => ({ id: '123456', tag: 'Target#0001', bot: false }),
                getInteger: () => 60,
                getString: () => 'test'
            }
        };

        await timeoutCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
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
            user: { id: 'admin-id' },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => true
                        }
                    }
                }
            },
            options: {
                getUser: () => ({ id: 'admin-id', tag: 'Admin#0001', bot: false }),
                getInteger: () => 60,
                getString: () => 'test'
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await timeoutCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.equal(deferred, false);
    });

    it('defers reply and executes timeout successfully', async () => {
        let deferred = false;
        let editedPayload = null;
        let timeoutArgs = null;
        let notifiedMsg = null;

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false,
            displayAvatarURL: () => 'https://example.com/avatar.png',
            send: async (msg) => {
                notifiedMsg = msg;
            }
        };

        const targetMember = {
            id: 'target-id',
            moderatable: true,
            roles: { highest: { position: 1 } },
            timeout: async (durationMs, reason) => {
                timeoutArgs = { durationMs, reason };
            }
        };

        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: 'Test Server',
                ownerId: 'owner-id',
                members: {
                    me: {
                        permissions: {
                            has: (perm) => true
                        }
                    },
                    fetch: async (id) => (id === 'target-id' ? targetMember : null)
                }
            },
            options: {
                getUser: () => targetUser,
                getInteger: () => 300,
                getString: () => '違規發言'
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedPayload = payload;
            },
            deleteReply: async () => {}
        };

        await timeoutCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(timeoutArgs);
        assert.equal(timeoutArgs.durationMs, 300000);
        assert.match(timeoutArgs.reason, /By Admin#0001: 違規發言/);
        assert.ok(notifiedMsg);
        assert.match(notifiedMsg, /5 分鐘/);
        assert.ok(editedPayload);
        assert.ok(editedPayload.components);
    });

    it('defers reply and executes untimeout when duration is 0', async () => {
        let timeoutArgs = null;
        let notifiedMsg = null;

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false,
            displayAvatarURL: () => 'https://example.com/avatar.png',
            send: async (msg) => {
                notifiedMsg = msg;
            }
        };

        const targetMember = {
            id: 'target-id',
            moderatable: true,
            isCommunicationDisabled: () => true,
            roles: { highest: { position: 1 } },
            timeout: async (durationMs, reason) => {
                timeoutArgs = { durationMs, reason };
            }
        };

        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-id', tag: 'Admin#0001' },
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: 'Test Server',
                ownerId: 'owner-id',
                members: {
                    me: {
                        permissions: {
                            has: (perm) => true
                        }
                    },
                    fetch: async (id) => (id === 'target-id' ? targetMember : null)
                }
            },
            options: {
                getUser: () => targetUser,
                getInteger: () => 0,
                getString: () => '提前解禁'
            },
            deferReply: async () => {},
            editReply: async () => {},
            deleteReply: async () => {}
        };

        await timeoutCommand.execute(mockInteraction, mockBot);

        assert.ok(timeoutArgs);
        assert.equal(timeoutArgs.durationMs, null);
        assert.match(timeoutArgs.reason, /By Admin#0001: 提前解禁/);
        assert.ok(notifiedMsg);
        assert.match(notifiedMsg, /解除/);
    });

    it('rejects untimeout if member is not currently timed out', async () => {
        let sentError = null;
        let deleted = false;

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false
        };

        const targetMember = {
            id: 'target-id',
            moderatable: true,
            isCommunicationDisabled: () => false,
            roles: { highest: { position: 1 } },
            timeout: async () => {}
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
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: 'Test Server',
                ownerId: 'owner-id',
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => targetMember
                }
            },
            options: {
                getUser: () => targetUser,
                getInteger: () => 0,
                getString: () => '解禁'
            },
            deferReply: async () => {},
            deleteReply: async () => {
                deleted = true;
            }
        };

        await timeoutCommand.execute(mockInteraction, mockBot);

        assert.equal(deleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /並未處於禁言狀態/);
    });

    it('handles exceptions in member.timeout cleanly with deleteReply and sendError', async () => {
        let sentError = null;
        let deleted = false;

        const targetUser = {
            id: 'target-id',
            tag: 'Target#0001',
            bot: false
        };

        const targetMember = {
            id: 'target-id',
            moderatable: true,
            roles: { highest: { position: 1 } },
            timeout: async () => {
                throw new Error('DiscordAPIError[50013]: Missing Permissions');
            }
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
            member: { roles: { highest: { position: 10 } } },
            guild: {
                name: 'Test Server',
                ownerId: 'owner-id',
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => targetMember
                }
            },
            options: {
                getUser: () => targetUser,
                getInteger: () => 60,
                getString: () => '原因'
            },
            deferReply: async () => {},
            deleteReply: async () => {
                deleted = true;
            }
        };

        await timeoutCommand.execute(mockInteraction, mockBot);

        assert.equal(deleted, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
    });
});
