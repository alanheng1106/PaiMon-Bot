import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const joinCommand = require('../src/commands/music/join').default || require('../src/commands/music/join');

describe('Join Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(joinCommand.data.name, 'join');
        assert.equal(joinCommand.data.dm_permission, false);
        assert.equal(joinCommand.category, 'music');
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

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when member is not in a voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: null } },
            guild: { members: { me: { voice: { channel: null } } } }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
        assert.match(sentError.desc, /你要先加入語音頻道/);
    });

    it('rejects execution when bot client member is missing', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1', permissionsFor: () => ({ has: () => true }) } } },
            guild: { members: { me: null } }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
        assert.match(sentError.desc, /無法取得機器人身分資訊/);
    });

    it('rejects execution when bot lacks permissions', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => false })
                    }
                }
            },
            guild: { members: { me: { id: 'bot-1', voice: { channel: null } } } }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限被拒絕');
    });

    it('rejects execution when bot is already in the same voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-same',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: { id: 'vc-same' } }
                    }
                }
            }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '已在頻道中');
    });

    it('rejects execution when bot is in a different voice channel (conflict)', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-user',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: { id: 'vc-other' } }
                    }
                }
            }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道衝突');
        assert.match(sentError.desc, /<#vc-other>/);
    });

    it('rejects execution when interaction channel is not text-based', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            channel: null,
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道錯誤');
    });

    it('defers reply and executes join successfully', async () => {
        let deferred = false;
        let joined = null;
        let sentSuccess = null;

        const mockBot = {
            music: {
                join: async (vc, tc) => {
                    joined = { vc, tc };
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            channel: {
                id: 'tc-1',
                isTextBased: () => true
            },
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(joined);
        assert.equal(joined.vc.id, 'vc-1');
        assert.equal(joined.tc.id, 'tc-1');
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /成功加入/);
    });

    it('catches and reports unexpected exceptions from music.join cleanly', async () => {
        let deferred = false;
        let sentError = null;

        const mockBot = {
            music: {
                join: async () => {
                    throw new Error('Shoukaku voice connection timed out');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            channel: {
                id: 'tc-1',
                isTextBased: () => true
            },
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            deferReply: async () => {
                deferred = true;
            }
        };

        await joinCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.ok(sentError);
        assert.equal(sentError.title, '加入失敗');
    });

    describe('Scheme 1 CV2 Card Builder & Interactive Delivery', () => {
        const { buildJoinSuccessCard } = require('../src/commands/music/join');

        it('constructs a complete Scheme 1 CV2 container with expected dimensions and hierarchy', () => {
            const card = buildJoinSuccessCard({
                voiceChannelId: 'vc-test-123',
                textChannelId: 'tc-test-456',
                executorId: 'user-789',
                botAvatarUrl: 'https://example.com/bot.png'
            });

            assert.ok(card);
            assert.ok(Array.isArray(card.components));
            assert.equal(card.components.length, 1);
            assert.equal(card.flags, 32768);

            const containerData = card.components[0].toJSON();
            assert.equal(containerData.accent_color, 0x5865f2);

            // 驗證組件順序與數量
            const innerComponents = containerData.components;
            assert.ok(innerComponents.length >= 6);

            // 1. 大標題 (H1)
            assert.equal(innerComponents[0].content, '# 🔊 語音連線已建立');

            // 2. 分割線 1
            assert.equal(innerComponents[1].divider, true);

            // 3. Section (圖文混排)
            const section = innerComponents[2];
            assert.match(section.components[0].content, /<#vc-test-123>/);
            assert.match(section.components[0].content, /<#tc-test-456>/);
            assert.match(section.components[0].content, /<@user-789>/);
            assert.equal(section.accessory.media.url, 'https://example.com/bot.png');

            // 4. 分割線 2
            assert.equal(innerComponents[3].divider, true);

            // 5. 操作按鈕行
            const actionRow = innerComponents[4];
            assert.equal(actionRow.components.length, 2);
            assert.equal(actionRow.components[0].custom_id, 'music:open_play_modal');
            assert.equal(actionRow.components[1].custom_id, 'music:disconnect:vc-test-123');

            // 6. 底部微字次要提示
            const footerText = innerComponents[5];
            assert.match(footerText.content, /^-# 💡 提示：/);
        });

        it('omits optional executor and avatar gracefully without breaking layout', () => {
            const card = buildJoinSuccessCard({
                voiceChannelId: 'vc-test-123',
                textChannelId: 'tc-test-456'
            });

            const containerData = card.components[0].toJSON();
            const statusText = containerData.components[2];
            assert.doesNotMatch(statusText.content, /召喚成員/);
            assert.match(statusText.content, /<#vc-test-123>/);
        });

        it('successfully delivers Scheme 1 CV2 payload via interaction.editReply when deferred', async () => {
            let deferred = false;
            let editRepliedPayload = null;

            const mockBot = {
                user: {
                    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/bot.png'
                },
                music: {
                    join: async () => {}
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                user: { id: 'user-caller-1' },
                channel: {
                    id: 'tc-bound-1',
                    isTextBased: () => true
                },
                member: {
                    voice: {
                        channel: {
                            id: 'vc-target-1',
                            permissionsFor: () => ({ has: () => true })
                        }
                    }
                },
                guild: {
                    members: {
                        me: {
                            id: 'bot-1',
                            voice: { channel: null }
                        }
                    }
                },
                deferReply: async () => {
                    deferred = true;
                    mockInteraction.deferred = true;
                },
                editReply: async (payload) => {
                    editRepliedPayload = payload;
                }
            };

            await joinCommand.execute(mockInteraction, mockBot);
            assert.equal(deferred, true);
            assert.ok(editRepliedPayload);
            assert.equal(editRepliedPayload.flags, 32768);

            const json = editRepliedPayload.components[0].toJSON();
            assert.equal(json.accent_color, 0x5865f2);
            assert.equal(json.components[0].content, '# 🔊 語音連線已建立');
        });
    });
});
