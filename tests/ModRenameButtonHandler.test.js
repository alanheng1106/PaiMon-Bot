import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags, ButtonStyle } = require('discord.js');

const ModRenameButtonHandler =
    require('../src/core/components/ModRenameButtonHandler').default ||
    require('../src/core/components/ModRenameButtonHandler');
const ComponentRouter =
    require('../src/core/components/ComponentRouter').default || require('../src/core/components/ComponentRouter');

describe('ModRenameButtonHandler (Scheme C Interactive Controls)', () => {
    const handler = new ModRenameButtonHandler();

    it('matches customId prefix mod:rename:(reset|revert):<userId>', () => {
        assert.equal(handler.customId, 'mod:rename');
        assert.equal(handler.matches('mod:rename:reset:123456789012345678'), true);
        assert.equal(handler.matches('mod:rename:revert:123456789012345678:T2xkTmljaw'), true);
        assert.equal(handler.matches('mod:rename'), true);
        assert.equal(handler.matches('mod:ban:123456789012345678'), false);
        assert.equal(handler.matches('random_button'), false);
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
            customId: 'mod:rename:reset:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects malformed customId format', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:invalidaction:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '格式錯誤');
    });

    it('rejects execution when member lacks ManageNicknames permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:reset:123456789012345678',
            memberPermissions: {
                has: (perm) => perm !== PermissionFlagsBits.ManageNicknames
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理暱稱/);
    });

    it('rejects execution when bot lacks ManageNicknames permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:reset:123456789012345678',
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
        assert.match(sentError.desc, /我缺少「管理暱稱」/);
    });

    it('rejects execution when target member is not found in guild', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:reset:123456789012345678',
            memberPermissions: { has: () => true },
            guild: {
                members: {
                    me: { permissions: { has: () => true } },
                    fetch: async () => null
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無成員');
    });

    it('rejects execution on hierarchy check failure', async () => {
        let sentError = null;
        const mockBot = {
            user: { id: '777777777777777777' },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockTargetUser = { id: '123456789012345678', tag: 'Target#0001', bot: false };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:reset:123456789012345678',
            user: { id: '999999999999999999' },
            member: {
                roles: { highest: { position: 10 } },
                permissions: { has: () => true }
            },
            memberPermissions: { has: () => true },
            guild: {
                ownerId: '888888888888888888',
                members: {
                    me: {
                        id: '777777777777777777',
                        roles: { highest: { position: 5 } },
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        user: mockTargetUser,
                        roles: { highest: { position: 8 } },
                        manageable: false,
                        nickname: 'CurrentNick'
                    })
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限溢位');
    });

    it('executes reset action: sets nickname to null, disables button on card, and sends success', async () => {
        let sentSuccess = null;
        let setNicknameArg = 'not-called';
        let editedMessage = null;

        const mockBot = {
            user: { id: '777777777777777777' },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };
        const mockTargetUser = { id: '123456789012345678', tag: 'Target#0001', bot: false };

        const mockCardComponents = [
            {
                toJSON: () => ({
                    type: 17, // Container
                    components: [
                        {
                            type: 1, // ActionRow
                            components: [
                                {
                                    type: 2,
                                    custom_id: 'mod:rename:reset:123456789012345678',
                                    label: '重置為預設',
                                    style: ButtonStyle.Secondary
                                }
                            ]
                        }
                    ]
                })
            }
        ];

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'mod:rename:reset:123456789012345678',
            user: { id: '999999999999999999' },
            member: {
                roles: { highest: { position: 30 } },
                permissions: { has: () => true }
            },
            memberPermissions: { has: () => true },
            guild: {
                ownerId: '888888888888888888',
                members: {
                    me: {
                        id: '777777777777777777',
                        roles: { highest: { position: 40 } },
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        user: mockTargetUser,
                        roles: { highest: { position: 5 } },
                        manageable: true,
                        nickname: 'HasCustomNick',
                        setNickname: async (arg) => {
                            setNicknameArg = arg;
                        }
                    })
                }
            },
            message: {
                components: mockCardComponents,
                edit: async (opts) => {
                    editedMessage = opts;
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(setNicknameArg, null);
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '🔄 暱稱已重置');
        assert.equal(sentSuccess.ephemeral, true);
        assert.ok(editedMessage);

        const updatedContainer = editedMessage.components[0].toJSON();
        const updatedButton = updatedContainer.components[0].components[0];
        assert.equal(updatedButton.disabled, true);
        assert.equal(updatedButton.label, '已重置為預設');
    });

    it('executes revert action: decodes base64, restores nickname, disables button, and sends success', async () => {
        let sentSuccess = null;
        let setNicknameArg = null;
        let editedMessage = null;

        const encodedOld = Buffer.from('PreviousNick').toString('base64url');
        const customId = `mod:rename:revert:123456789012345678:${encodedOld}`;

        const mockBot = {
            user: { id: '777777777777777777' },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };
        const mockTargetUser = { id: '123456789012345678', tag: 'Target#0001', bot: false };

        const mockCardComponents = [
            {
                toJSON: () => ({
                    type: 17,
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    custom_id: customId,
                                    label: '恢復原暱稱',
                                    style: ButtonStyle.Secondary
                                }
                            ]
                        }
                    ]
                })
            }
        ];

        const mockInteraction = {
            inCachedGuild: () => true,
            customId,
            user: { id: '999999999999999999' },
            member: {
                roles: { highest: { position: 30 } },
                permissions: { has: () => true }
            },
            memberPermissions: { has: () => true },
            guild: {
                ownerId: '888888888888888888',
                members: {
                    me: {
                        id: '777777777777777777',
                        roles: { highest: { position: 40 } },
                        permissions: { has: () => true }
                    },
                    fetch: async () => ({
                        user: mockTargetUser,
                        roles: { highest: { position: 5 } },
                        manageable: true,
                        nickname: 'CurrentWrongNick',
                        setNickname: async (arg) => {
                            setNicknameArg = arg;
                        }
                    })
                }
            },
            message: {
                components: mockCardComponents,
                edit: async (opts) => {
                    editedMessage = opts;
                }
            },
            deferReply: async () => {}
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(setNicknameArg, 'PreviousNick');
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '↺ 暱稱已恢復');
        assert.match(sentSuccess.desc, /PreviousNick/);
        assert.equal(sentSuccess.ephemeral, true);

        const updatedContainer = editedMessage.components[0].toJSON();
        const updatedButton = updatedContainer.components[0].components[0];
        assert.equal(updatedButton.disabled, true);
        assert.equal(updatedButton.label, '已恢復原暱稱');
    });

    it('integrates with ComponentRouter to handle mod:rename customIds', async () => {
        const router = new ComponentRouter();
        router.register(handler);

        assert.equal(router.has('mod:rename:reset:123456789012345678'), true);
        assert.equal(router.has('mod:rename:revert:123456789012345678:abc'), true);
        assert.equal(router.has('mod:rename:unknown'), true);
        assert.equal(router.has('mod:history:123456789012345678'), false);
    });
});
