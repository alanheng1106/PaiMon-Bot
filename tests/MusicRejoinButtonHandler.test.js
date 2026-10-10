import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicRejoinButtonHandler =
    require('../src/core/components/MusicRejoinButtonHandler').default ||
    require('../src/core/components/MusicRejoinButtonHandler');

describe('MusicRejoinButtonHandler', () => {
    const handler = new MusicRejoinButtonHandler();

    it('matches customId prefix music:rejoin:<channelId>', () => {
        assert.equal(handler.customId, 'music:rejoin');
        assert.equal(handler.matches('music:rejoin:vc-123'), true);
        assert.equal(handler.matches('music:rejoin'), true);
        assert.equal(handler.matches('music:disconnect'), false);
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
            customId: 'music:rejoin:vc-1'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when user is not in a voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
        assert.match(sentError.desc, /你要先加入語音頻道/);
    });

    it('rejects execution when bot identity cannot be resolved', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: {
                    me: null,
                    fetchMe: async () => null
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
        assert.match(sentError.desc, /無法取得機器人身分資訊/);
    });

    it('rejects execution when bot is already in the same channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '已在頻道中');
    });

    it('rejects execution when bot is already in a different channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: {
                    me: { voice: { channel: { id: 'vc-2' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道衝突');
        assert.match(sentError.desc, /vc-2/);
    });

    it('rejects execution when bot lacks Connect or Speak permissions', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({
                            has: (perms) => false
                        })
                    }
                }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限被拒絕');
    });

    it('rejects execution when interaction channel is not text based', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-1',
            channel: { isTextBased: () => false },
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({
                            has: () => true
                        })
                    }
                }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道錯誤');
    });

    it('successfully joins channel and sends success notification', async () => {
        let joinedVoiceChannel = null;
        let joinedTextChannel = null;
        let sentSuccess = null;

        const mockBot = {
            music: {
                join: async (vc, tc) => {
                    joinedVoiceChannel = vc;
                    joinedTextChannel = tc;
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };

        const targetVc = {
            id: 'vc-target',
            permissionsFor: () => ({
                has: () => true
            })
        };
        const targetTc = {
            id: 'tc-target',
            isTextBased: () => true
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-target',
            channel: targetTc,
            member: { voice: { channel: targetVc } },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(joinedVoiceChannel, targetVc);
        assert.equal(joinedTextChannel, targetTc);
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '🔊 成功召回');
        assert.match(sentSuccess.desc, /vc-target/);
    });

    it('defers reply before joining if deferReply is supported to avoid 3s timeout', async () => {
        let deferCalled = false;
        let joined = false;

        const mockBot = {
            music: {
                join: async () => {
                    assert.equal(deferCalled, true, 'deferReply must be called before music.join');
                    joined = true;
                }
            },
            sendSuccess: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-target',
            channel: { isTextBased: () => true },
            member: {
                voice: {
                    channel: {
                        id: 'vc-target',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            },
            deferReply: async () => {
                deferCalled = true;
                mockInteraction.deferred = true;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(deferCalled, true);
        assert.equal(joined, true);
    });

    it('catches and reports unexpected errors in music.join', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                join: async () => {
                    throw new Error('Lavalink connection rejected');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:rejoin:vc-target',
            channel: { isTextBased: () => true },
            member: {
                voice: {
                    channel: {
                        id: 'vc-target',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '召回失敗');
    });
});
