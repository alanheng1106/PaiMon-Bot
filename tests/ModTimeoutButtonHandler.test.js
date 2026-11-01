import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const ModUntimeoutButtonHandler =
    require('../src/core/components/ModUntimeoutButtonHandler').default ||
    require('../src/core/components/ModUntimeoutButtonHandler');

const ModTimeoutButtonHandler =
    require('../src/core/components/ModTimeoutButtonHandler').default ||
    require('../src/core/components/ModTimeoutButtonHandler');

const ComponentRouter =
    require('../src/core/components/ComponentRouter').default || require('../src/core/components/ComponentRouter');

describe('ModUntimeoutButtonHandler (Quick Untimeout)', () => {
    const handler = new ModUntimeoutButtonHandler();

    it('matches customId prefix mod:untimeout:<userId>', () => {
        assert.equal(handler.customId, 'mod:untimeout');
        assert.equal(handler.matches('mod:untimeout:123456789012345678'), true);
        assert.equal(handler.matches('mod:untimeout'), true);
        assert.equal(handler.matches('mod:timeout:123456789012345678:600'), false);
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
            customId: 'mod:untimeout:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects invalid snowflake format', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:untimeout:invalid-snowflake'
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
            customId: 'mod:untimeout:123456789012345678',
            memberPermissions: {
                has: (perm) => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
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
            customId: 'mod:untimeout:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => false
                        }
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
    });

    it('rejects untimeout when target member is not found', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:untimeout:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => null
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無成員');
    });

    it('rejects untimeout when target member is not moderatable', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:untimeout:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => ({
                        moderatable: false,
                        user: { tag: 'Owner#0001' }
                    })
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限溢位');
    });

    it('rejects untimeout when target member is not currently timed out', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:untimeout:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => ({
                        moderatable: true,
                        isCommunicationDisabled: () => false,
                        user: { tag: 'User#0001' }
                    })
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /並未處於禁言狀態/);
    });

    it('defers, untimeouts target member, updates source button, and sends ephemeral Scheme B card', async () => {
        let deferred = false;
        let timedOutArgs = null;
        let dmSent = null;
        let editedMessageComponents = null;
        let repliedPayload = null;

        const targetUser = {
            id: '123456789012345678',
            tag: 'ToxicUser#1234',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
            send: async (msg) => {
                dmSent = msg;
            }
        };

        const targetMember = {
            id: '123456789012345678',
            user: targetUser,
            moderatable: true,
            isCommunicationDisabled: () => true,
            timeout: async (durationMs, reason) => {
                timedOutArgs = { durationMs, reason };
            }
        };

        const mockBot = {
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:untimeout:123456789012345678',
            user: { id: 'admin-id', tag: 'Admin#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                name: 'Test Server',
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => targetMember
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
                                        custom_id: 'mod:untimeout:123456789012345678',
                                        label: '提前解除禁言',
                                        style: 3,
                                        emoji: { name: '🔓' }
                                    },
                                    {
                                        custom_id: 'mod:history:123456789012345678',
                                        label: '處分記錄',
                                        style: 2,
                                        emoji: { name: '📜' }
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async ({ components }) => {
                    editedMessageComponents = components;
                }
            },
            deferReply: async ({ flags }) => {
                deferred = true;
                assert.equal(flags, MessageFlags.Ephemeral);
            },
            deferred: true,
            replied: false,
            editReply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(timedOutArgs);
        assert.equal(timedOutArgs.durationMs, null);
        assert.match(timedOutArgs.reason, /Admin#0001/);
        assert.ok(dmSent);
        assert.match(dmSent, /已被管理員提前解除/);

        // Verify button update on source message
        assert.ok(editedMessageComponents);
        const updatedContainer = editedMessageComponents[0].toJSON();
        const updatedRow = updatedContainer.components[0];
        const untimeoutBtn = updatedRow.components[0];
        assert.equal(untimeoutBtn.disabled, true);
        assert.equal(untimeoutBtn.label, '已提前解禁');
        assert.equal(untimeoutBtn.style, 2); // Secondary

        // Verify ephemeral reply card is Scheme B
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.flags & MessageFlags.Ephemeral);
        const cardJson = repliedPayload.components[0].toJSON();
        assert.match(cardJson.components[0].content, /# 🔓 解除禁言生效/);
    });
});

describe('ModTimeoutButtonHandler (Quick Re-timeout)', () => {
    const handler = new ModTimeoutButtonHandler();

    it('matches customId prefix mod:timeout:<userId>:<seconds>', () => {
        assert.equal(handler.customId, 'mod:timeout');
        assert.equal(handler.matches('mod:timeout:123456789012345678:600'), true);
        assert.equal(handler.matches('mod:timeout'), true);
        assert.equal(handler.matches('mod:untimeout:123456789012345678'), false);
    });

    it('rejects invalid customId format', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:timeout:invalid'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
    });

    it('rejects non-positive duration', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:timeout:123456789012345678:0'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '參數錯誤');
    });

    it('defers, timeouts target member, updates button, and sends ephemeral Scheme B card', async () => {
        let deferred = false;
        let timedOutArgs = null;
        let dmSent = null;
        let repliedPayload = null;

        const targetUser = {
            id: '123456789012345678',
            tag: 'ToxicUser#1234',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
            send: async (msg) => {
                dmSent = msg;
            }
        };

        const targetMember = {
            id: '123456789012345678',
            user: targetUser,
            moderatable: true,
            timeout: async (durationMs, reason) => {
                timedOutArgs = { durationMs, reason };
            }
        };

        const mockBot = {
            sendError: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:timeout:123456789012345678:600',
            user: { id: 'admin-id', tag: 'Admin#0001' },
            memberPermissions: {
                has: () => true
            },
            guild: {
                name: 'Test Server',
                members: {
                    me: {
                        permissions: {
                            has: () => true
                        }
                    },
                    fetch: async () => targetMember
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
                                        custom_id: 'mod:timeout:123456789012345678:600',
                                        label: '重新禁言 10 分鐘',
                                        style: 2,
                                        emoji: { name: '⏳' }
                                    }
                                ]
                            }
                        ]
                    }
                ],
                edit: async () => {}
            },
            deferReply: async ({ flags }) => {
                deferred = true;
                assert.equal(flags, MessageFlags.Ephemeral);
            },
            deferred: true,
            replied: false,
            editReply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(timedOutArgs);
        assert.equal(timedOutArgs.durationMs, 600000);
        assert.match(timedOutArgs.reason, /Admin#0001/);
        assert.ok(dmSent);
        assert.match(dmSent, /10 分鐘/);

        // Verify ephemeral card
        assert.ok(repliedPayload);
        const cardJson = repliedPayload.components[0].toJSON();
        assert.match(cardJson.components[0].content, /# ⏳ 成員禁言處分/);
    });

    it('rejects timeout when clicking member has equal or lower role hierarchy than target', async () => {
        let sentError = null;
        const targetMember = {
            id: '123456789012345678',
            user: { id: '123456789012345678', tag: 'SeniorMod#0001' },
            roles: { highest: { position: 50 } },
            moderatable: true
        };
        const mockBot = {
            user: { id: 'bot-id' },
            sendError: async (_i, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:timeout:123456789012345678:600',
            user: { id: 'junior-mod', tag: 'JuniorMod#0001' },
            member: { roles: { highest: { position: 10 } } },
            memberPermissions: { has: () => true },
            guild: {
                ownerId: 'owner-id',
                members: {
                    me: { permissions: { has: () => true } },
                    fetch: async () => targetMember
                }
            },
            deferReply: async () => {},
            deferred: true
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限受限');
        assert.match(sentError.desc, /最高身分組不高於/);
    });
});

describe('ComponentRouter Integration with Timeout Handlers', () => {
    it('registers and routes to ModUntimeoutButtonHandler and ModTimeoutButtonHandler correctly', async () => {
        const router = new ComponentRouter();
        const untimeoutHandler = new ModUntimeoutButtonHandler();
        const timeoutHandler = new ModTimeoutButtonHandler();

        router.register(untimeoutHandler);
        router.register(timeoutHandler);

        assert.equal(router.has('mod:untimeout:123456789012345678'), true);
        assert.equal(router.has('mod:timeout:123456789012345678:600'), true);
        assert.equal(router.has('mod:other:123456789012345678'), false);

        let untimeoutExecuted = false;
        let timeoutExecuted = false;

        untimeoutHandler.execute = async () => {
            untimeoutExecuted = true;
        };
        timeoutHandler.execute = async () => {
            timeoutExecuted = true;
        };

        const res1 = await router.handle({ customId: 'mod:untimeout:123456789012345678' }, {});
        assert.equal(res1, true);
        assert.equal(untimeoutExecuted, true);

        const res2 = await router.handle({ customId: 'mod:timeout:123456789012345678:600' }, {});
        assert.equal(res2, true);
        assert.equal(timeoutExecuted, true);
    });
});
