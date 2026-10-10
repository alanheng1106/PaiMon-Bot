import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Colors } = require('../src/config');

const renameModule = require('../src/commands/admin/rename');
const renameCommand = renameModule.default || renameModule;
const buildRenameActionCard = renameModule.buildRenameActionCard;

describe('Rename Admin Command & Scheme C Card Builder', () => {
    it('has correct slash command configuration', () => {
        assert.equal(renameCommand.data.name, 'rename');
        assert.equal(renameCommand.data.dm_permission, false);
        assert.equal(renameCommand.data.default_member_permissions, PermissionFlagsBits.ManageNicknames.toString());
        assert.equal(renameCommand.category, 'admin');

        const userOption = renameCommand.data.options.find((opt) => opt.name === 'user');
        assert.ok(userOption);
        assert.equal(userOption.required, true);

        const nickOption = renameCommand.data.options.find((opt) => opt.name === 'nickname');
        assert.ok(nickOption);
        assert.equal(nickOption.required, false);
        assert.equal(nickOption.max_length, 32);
    });

    describe('buildRenameActionCard (Scheme C)', () => {
        const mockTargetUser = {
            id: '123456789012345678',
            username: 'alice',
            tag: 'alice#0000',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };
        const mockExecutor = {
            id: '987654321098765432',
            username: 'admin',
            tag: 'admin#0000'
        };

        it('builds actionable card for custom nickname change with rollback button', () => {
            const payload = buildRenameActionCard({
                targetUser: mockTargetUser,
                oldNickname: 'OldNick',
                newNickname: 'SuperStar',
                executor: mockExecutor
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, Colors.Success);

            const containerStr = JSON.stringify(container);
            // 標題
            assert.match(containerStr, /# 📝 變更成員暱稱/);
            // 核心 Section：目標成員與頭像
            assert.match(containerStr, /123456789012345678/);
            assert.match(containerStr, /https:\/\/cdn\.discordapp\.com\/avatars\/123\/avatar\.png/);
            // 差異呈現
            assert.match(containerStr, /`OldNick` ➜ \*\*`SuperStar`\*\*/);
            // 按鈕：恢復原暱稱 (Base64URL encoded)
            const expectedEncoded = Buffer.from('OldNick').toString('base64url');
            assert.match(containerStr, new RegExp(`mod:rename:revert:123456789012345678:${expectedEncoded}`));
            assert.match(containerStr, /恢復原暱稱/);
            // 按鈕：處分記錄
            assert.match(containerStr, /mod:history:123456789012345678/);
            assert.match(containerStr, /處分記錄/);
            // 底部審計
            assert.match(containerStr, /987654321098765432/);
        });

        it('builds actionable card for resetting nickname', () => {
            const payload = buildRenameActionCard({
                targetUser: mockTargetUser,
                oldNickname: 'OldNick',
                newNickname: null,
                executor: mockExecutor
            });

            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, Colors.Primary);

            const containerStr = JSON.stringify(container);
            // 標題
            assert.match(containerStr, /# 🔄 重置成員暱稱/);
            // 差異呈現
            assert.match(containerStr, /`OldNick` ➜ \*\(已恢復預設名稱\)\*/);
            // 存在舊暱稱時提供恢復按鈕
            assert.match(containerStr, /mod:rename:revert:123456789012345678/);
        });

        it('provides reset button when setting nickname for user without prior custom nickname', () => {
            const payload = buildRenameActionCard({
                targetUser: mockTargetUser,
                oldNickname: null,
                newNickname: 'BrandNewNick',
                executor: mockExecutor
            });

            const container = payload.components[0].toJSON();
            const containerStr = JSON.stringify(container);

            assert.match(containerStr, /\*\(未設定\)\* ➜ \*\*`BrandNewNick`\*\*/);
            assert.match(containerStr, /mod:rename:reset:123456789012345678/);
            assert.match(containerStr, /重置為預設/);
        });
    });

    describe('execute command workflow', () => {
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

            await renameCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '無法執行');
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
                options: {
                    getUser: () => ({ id: '123' }),
                    getString: () => 'NewName'
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

            await renameCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '權限不足');
        });

        it('rejects execution when nickname is purely whitespace', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                options: {
                    getUser: () => ({ id: '123' }),
                    getString: () => '     '
                },
                guild: {
                    members: {
                        me: {
                            permissions: {
                                has: () => true
                            }
                        }
                    }
                }
            };

            await renameCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '格式錯誤');
        });

        it('rejects execution when member is not manageable (hierarchy violation)', async () => {
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
                options: {
                    getUser: () => mockTargetUser,
                    getString: () => 'NewNick'
                },
                user: { id: '999999999999999999' },
                member: {
                    roles: { highest: { position: 10 } },
                    permissions: { has: () => true }
                },
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
                            nickname: 'OldNick'
                        })
                    }
                },
                deferReply: async () => {},
                deleteReply: async () => {}
            };

            await renameCommand.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '權限溢位');
        });

        it('successfully executes nickname update and sends Scheme C card', async () => {
            let editedPayload = null;
            let setNicknameArg = null;
            const mockTargetUser = {
                id: '123456789012345678',
                username: 'alice',
                tag: 'alice#0000',
                bot: false,
                displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
            };

            const mockBot = {
                user: { id: '777777777777777777' }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                deferred: true,
                replied: false,
                options: {
                    getUser: () => mockTargetUser,
                    getString: () => 'CoolAlice'
                },
                user: { id: '999999999999999999', username: 'moderator' },
                member: {
                    roles: { highest: { position: 20 } },
                    permissions: { has: () => true }
                },
                guild: {
                    ownerId: '888888888888888888',
                    members: {
                        me: {
                            id: '777777777777777777',
                            roles: { highest: { position: 30 } },
                            permissions: { has: () => true }
                        },
                        fetch: async () => ({
                            user: mockTargetUser,
                            roles: { highest: { position: 5 } },
                            manageable: true,
                            nickname: 'OldAlice',
                            setNickname: async (newNick) => {
                                setNicknameArg = newNick;
                            }
                        })
                    }
                },
                deferReply: async () => {},
                editReply: async (payload) => {
                    editedPayload = payload;
                }
            };

            await renameCommand.execute(mockInteraction, mockBot);
            assert.equal(setNicknameArg, 'CoolAlice');
            assert.ok(editedPayload);
            assert.equal(editedPayload.flags, MessageFlags.IsComponentsV2);

            const json = JSON.stringify(editedPayload.components[0].toJSON());
            assert.match(json, /# 📝 變更成員暱稱/);
            assert.match(json, /`OldAlice` ➜ \*\*`CoolAlice`\*\*/);
            assert.match(json, /mod:rename:revert:123456789012345678/);
            assert.match(json, /mod:history:123456789012345678/);
        });
    });
});
