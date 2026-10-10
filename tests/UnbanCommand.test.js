import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const unbanCommand = require('../src/commands/admin/unban').default || require('../src/commands/admin/unban');

describe('Unban Admin Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(unbanCommand.data.name, 'unban');
        assert.equal(unbanCommand.data.dm_permission, false);
        assert.equal(unbanCommand.data.default_member_permissions, PermissionFlagsBits.BanMembers.toString());
        assert.equal(unbanCommand.category, 'admin');

        const userIdOption = unbanCommand.data.options.find((opt) => opt.name === 'userid');
        assert.ok(userIdOption);
        assert.equal(userIdOption.required, true);

        const reasonOption = unbanCommand.data.options.find((opt) => opt.name === 'reason');
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

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects execution with invalid snowflake ID format', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getString: (name) => {
                    if (name === 'userid') return 'not-a-number';
                    return null;
                }
            }
        };

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
        assert.match(sentError.desc, /有效的使用者 ID/);
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
            options: {
                getString: (name) => {
                    if (name === 'userid') return '123456789012345678';
                    return null;
                }
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => perm !== PermissionFlagsBits.BanMembers
                        }
                    }
                }
            }
        };

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /Ban Members/);
    });

    it('defers reply and rejects when user is not in ban list', async () => {
        let deferred = false;
        let deletedReply = false;
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getString: (name) => {
                    if (name === 'userid') return '123456789012345678';
                    return 'some reason';
                }
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    }
                },
                bans: {
                    fetch: async () => {
                        throw new Error('Unknown Ban');
                    }
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deletedReply = true;
            }
        };

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(deletedReply, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '未在封鎖名單');
    });

    it('defers reply and executes unban successfully', async () => {
        let deferred = false;
        let unbannedUserId = null;
        let unbanReason = null;
        let sentSuccess = null;
        let editedReply = null;

        const mockBot = {
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Admin#0001' },
            options: {
                getString: (name) => {
                    if (name === 'userid') return '123456789012345678';
                    return 'appealed';
                }
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    unban: async (id, reason) => {
                        unbannedUserId = id;
                        unbanReason = reason;
                    }
                },
                bans: {
                    fetch: async (id) => {
                        return {
                            user: { id, tag: 'BannedUser#1234' }
                        };
                    }
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                editedReply = payload;
            }
        };

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(unbannedUserId, '123456789012345678');
        assert.equal(unbanReason, 'By Admin#0001: appealed');
        assert.ok(editedReply);
        assert.ok(editedReply.flags & MessageFlags.IsComponentsV2);
        const json = editedReply.components[0].toJSON();
        assert.match(json.components[0].content, /^# 🔓 解除封鎖成功/);
        const section = json.components.find((c) => c.type === 9);
        assert.ok(section);
        assert.match(section.components[0].content, /BannedUser#1234/);
    });

    it('handles unexpected exceptions in members.unban cleanly', async () => {
        let deferred = false;
        let deletedReply = false;
        let sentError = null;

        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { tag: 'Admin#0001' },
            options: {
                getString: (name) => {
                    if (name === 'userid') return '123456789012345678';
                    return null;
                }
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    unban: async () => {
                        throw new Error('DiscordAPIError[50013]: Missing Permissions');
                    }
                },
                bans: {
                    fetch: async (id) => {
                        return {
                            user: { id, tag: 'BannedUser#1234' }
                        };
                    }
                }
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deletedReply = true;
            }
        };

        await unbanCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(deletedReply, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
    });
});
