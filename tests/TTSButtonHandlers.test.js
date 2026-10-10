import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const TTSUnbindButtonHandler =
    require('../src/core/components/TTSUnbindButtonHandler').default ||
    require('../src/core/components/TTSUnbindButtonHandler');

const TTSTestButtonHandler =
    require('../src/core/components/TTSTestButtonHandler').default ||
    require('../src/core/components/TTSTestButtonHandler');

const TTSStopButtonHandler =
    require('../src/core/components/TTSStopButtonHandler').default ||
    require('../src/core/components/TTSStopButtonHandler');

const TTSReplayButtonHandler =
    require('../src/core/components/TTSReplayButtonHandler').default ||
    require('../src/core/components/TTSReplayButtonHandler');

const ComponentRouter =
    require('../src/core/components/ComponentRouter').default || require('../src/core/components/ComponentRouter');

describe('TTSUnbindButtonHandler', () => {
    const handler = new TTSUnbindButtonHandler();

    it('matches customId prefix tts:unbind:<channelId>', () => {
        assert.equal(handler.customId, 'tts:unbind');
        assert.equal(handler.matches('tts:unbind:123456789012345678'), true);
        assert.equal(handler.matches('tts:unbind'), true);
        assert.equal(handler.matches('tts:test:123456789012345678'), false);
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
            customId: 'tts:unbind:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.match(sentError.desc, /伺服器內使用/);
    });

    it('rejects when member lacks ManageGuild permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:unbind:123456789012345678',
            memberPermissions: {
                has: (perm) => perm !== PermissionFlagsBits.ManageGuild
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /管理伺服器/);
    });

    it('rejects when no TTS channel is currently configured', async () => {
        let sentError = null;
        const mockBot = {
            settings: {
                get: () => null
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:unbind:123456789012345678',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild-1' }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /尚未綁定/);
    });

    it('successfully unbinds and updates message in-place', async () => {
        let savedSettings = null;
        let updatedPayload = null;

        const mockBot = {
            settings: {
                get: () => ({ channelId: 'ch-111', lang: 'zh-TW' }),
                set: (guildId, key, value) => {
                    savedSettings = { guildId, key, value };
                }
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:unbind:ch-111',
            memberPermissions: {
                has: () => true
            },
            guild: { id: 'guild-1', iconURL: () => null },
            user: { id: 'admin-1', username: 'Admin' },
            update: async (payload) => {
                updatedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.ok(savedSettings);
        assert.equal(savedSettings.guildId, 'guild-1');
        assert.equal(savedSettings.key, 'tts');
        assert.equal(savedSettings.value, null);

        assert.ok(updatedPayload);
        assert.equal(updatedPayload.flags, MessageFlags.IsComponentsV2);
        const containerJson = updatedPayload.components[0].toJSON();
        assert.match(JSON.stringify(containerJson), /頻道已解除/);
        assert.match(JSON.stringify(containerJson), /<#ch-111>/);
    });
});

describe('TTSTestButtonHandler', () => {
    const handler = new TTSTestButtonHandler();

    it('matches customId prefix tts:test:<channelId>', () => {
        assert.equal(handler.customId, 'tts:test');
        assert.equal(handler.matches('tts:test:123456789012345678'), true);
        assert.equal(handler.matches('tts:test'), true);
        assert.equal(handler.matches('tts:unbind:123456789012345678'), false);
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
            customId: 'tts:test:123456789012345678'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects when member lacks ManageGuild permission', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:test:123456789012345678',
            memberPermissions: {
                has: () => false
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
    });

    it('rejects when member is not in a voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:test:123456789012345678',
            memberPermissions: { has: () => true },
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音錯誤');
        assert.match(sentError.desc, /加入語音頻道/);
    });

    it('rejects when bot lacks Connect or Speak permissions in target voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:test:123456789012345678',
            memberPermissions: { has: () => true },
            guild: {
                members: {
                    me: { id: 'bot-1', voice: { channel: null } }
                }
            },
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({
                            has: (perms) => false
                        })
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限被拒絕');
        assert.match(sentError.desc, /連線/);
    });

    it('rejects when bot is already in another voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:test:123456789012345678',
            memberPermissions: { has: () => true },
            guild: {
                members: {
                    me: { id: 'bot-1', voice: { channel: { id: 'vc-other' } } }
                }
            },
            member: {
                voice: {
                    channel: {
                        id: 'vc-user',
                        permissionsFor: () => ({
                            has: () => true
                        })
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
        assert.match(sentError.desc, /<#vc-other>/);
    });

    it('successfully searches and plays test audio in member voice channel', async () => {
        let playedTrack = null;
        let sentSuccess = null;
        let deferredFlags = null;

        const mockBot = {
            settings: {
                get: () => ({ channelId: 'ch-1', lang: 'ja' })
            },
            music: {
                search: async () => ({
                    tracks: [{ info: { title: '', author: '' } }]
                }),
                play: async (voiceChannel, textChannel, track, author, options) => {
                    playedTrack = { voiceChannel, textChannel, track, author, options };
                }
            },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };

        const mockVoiceChannel = {
            id: 'vc-user',
            name: 'Voice Lounge',
            permissionsFor: () => ({
                has: () => true
            })
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:test:ch-1',
            memberPermissions: { has: () => true },
            guild: {
                id: 'guild-1',
                members: {
                    me: { id: 'bot-1', voice: { channel: null } }
                }
            },
            member: {
                voice: {
                    channel: mockVoiceChannel
                }
            },
            channel: { id: 'text-ch-1' },
            user: { id: 'admin-1', username: 'Admin' },
            deferReply: async (opts) => {
                deferredFlags = opts?.flags;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(deferredFlags, MessageFlags.Ephemeral);
        assert.ok(playedTrack);
        assert.equal(playedTrack.voiceChannel.id, 'vc-user');
        assert.equal(playedTrack.options?.isTTS, true);
        assert.match(playedTrack.track.info.author, /ja/);

        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '🔊 測試語音播放中');
        assert.match(sentSuccess.desc, /<#vc-user>/);
        assert.match(sentSuccess.desc, /ja/);
        assert.equal(sentSuccess.ephemeral, true);
    });
});

describe('TTSStopButtonHandler', () => {
    const handler = new TTSStopButtonHandler();

    it('matches customId tts:stop', () => {
        assert.equal(handler.customId, 'tts:stop');
        assert.equal(handler.matches('tts:stop'), true);
        assert.equal(handler.matches('tts:stop:something'), true);
        assert.equal(handler.matches('tts:replay'), false);
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
            customId: 'tts:stop'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when member is not in voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:stop',
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音錯誤');
    });

    it('rejects execution when bot is not in voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:stop',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: { members: { me: { voice: { channel: null } } } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /未在任何語音頻道/);
    });

    it('rejects execution when user is in a different voice channel than bot', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:stop',
            member: { voice: { channel: { id: 'vc-user' } } },
            guild: { members: { me: { voice: { channel: { id: 'vc-bot' } } } } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
        assert.match(sentError.desc, /<#vc-bot>/);
    });

    it('rejects execution when queue is empty or not playing', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({ isEmpty: () => true })
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:stop',
            guild: { id: 'g-1', members: { me: { voice: { channel: { id: 'vc-1' } } } } },
            member: { voice: { channel: { id: 'vc-1' } } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /沒有正在播放/);
    });

    it('successfully stops music and sends success response', async () => {
        let stoppedGuildId = null;
        let sentSuccess = null;

        const mockBot = {
            music: {
                getQueue: () => ({ isEmpty: () => false }),
                stop: (guildId) => {
                    stoppedGuildId = guildId;
                }
            },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            },
            sendError: async () => {}
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:stop',
            guild: { id: 'g-stop-1', members: { me: { voice: { channel: { id: 'vc-1' } } } } },
            member: { voice: { channel: { id: 'vc-1' } } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(stoppedGuildId, 'g-stop-1');
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '⏹️ 語音已停止');
        assert.equal(sentSuccess.ephemeral, true);
    });
});

describe('TTSReplayButtonHandler', () => {
    const handler = new TTSReplayButtonHandler();
    const { storeTTSReplay, ttsReplayCache } = require('../src/commands/general/tts');

    it('matches customId prefix tts:replay:<id>', () => {
        assert.equal(handler.customId, 'tts:replay');
        assert.equal(handler.matches('tts:replay:abc123'), true);
        assert.equal(handler.matches('tts:replay'), true);
        assert.equal(handler.matches('tts:stop'), false);
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
            customId: 'tts:replay:abc'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when replay cache has expired or does not exist', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'tts:replay:non-existent'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '快取已過期');
    });

    it('rejects execution when member is not in voice channel', async () => {
        const replayId = storeTTSReplay('測試文本', 'zh-TW', 'u-1', 'g-1');
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: `tts:replay:${replayId}`,
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音錯誤');
    });

    it('rejects execution when bot lacks Connect or Speak permissions', async () => {
        const replayId = storeTTSReplay('測試文本', 'zh-TW', 'u-1', 'g-1');
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: `tts:replay:${replayId}`,
            guild: { members: { me: { voice: { channel: null } } } },
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => false })
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限被拒絕');
    });

    it('rejects execution when bot is in another voice channel', async () => {
        const replayId = storeTTSReplay('測試文本', 'zh-TW', 'u-1', 'g-1');
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: `tts:replay:${replayId}`,
            guild: { members: { me: { voice: { channel: { id: 'vc-bot-other' } } } } },
            member: {
                voice: {
                    channel: {
                        id: 'vc-user',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
        assert.match(sentError.desc, /<#vc-bot-other>/);
    });

    it('successfully plays replay audio and confirms with ephemeral message', async () => {
        const replayId = storeTTSReplay('重播文本內容', 'en', 'u-orig', 'g-1');
        let playedTrack = null;
        let sentSuccess = null;
        let deferredOptions = null;

        const mockBot = {
            music: {
                search: async () => ({
                    tracks: [{ info: { title: '', author: '' } }]
                }),
                play: async (voiceChannel, textChannel, track, author, options) => {
                    playedTrack = { voiceChannel, textChannel, track, author, options };
                }
            },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            },
            sendError: async () => {}
        };

        const mockVoiceChannel = {
            id: 'vc-replay',
            permissionsFor: () => ({ has: () => true })
        };
        const mockTextChannel = {
            id: 'tc-replay',
            isTextBased: () => true
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: `tts:replay:${replayId}`,
            guild: { members: { me: { voice: { channel: null } } } },
            member: { voice: { channel: mockVoiceChannel } },
            channel: mockTextChannel,
            user: { id: 'u-clicker', username: 'Clicker' },
            deferReply: async (opts) => {
                deferredOptions = opts;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.ok(deferredOptions?.flags === MessageFlags.Ephemeral);
        assert.ok(playedTrack);
        assert.equal(playedTrack.voiceChannel.id, 'vc-replay');
        assert.equal(playedTrack.options?.isTTS, true);
        assert.match(playedTrack.track.info.title, /重播文本內容/);
        assert.match(playedTrack.track.info.author, /en/);

        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '🔁 語音重播中');
        assert.equal(sentSuccess.ephemeral, true);
        assert.match(sentSuccess.desc, /重播文本內容/);
    });
});

describe('ComponentRouter TTS Handlers Integration', () => {
    it('routes tts:unbind, tts:test, tts:stop, and tts:replay buttons to registered handlers', async () => {
        const router = new ComponentRouter();
        const unbindHandler = new TTSUnbindButtonHandler();
        const testHandler = new TTSTestButtonHandler();
        const stopHandler = new TTSStopButtonHandler();
        const replayHandler = new TTSReplayButtonHandler();

        router.register(unbindHandler);
        router.register(testHandler);
        router.register(stopHandler);
        router.register(replayHandler);

        assert.equal(router.has('tts:unbind:ch-123'), true);
        assert.equal(router.has('tts:test:ch-123'), true);
        assert.equal(router.has('tts:stop'), true);
        assert.equal(router.has('tts:replay:abc789'), true);
        assert.equal(router.has('tts:unknown'), false);

        let executedStop = false;
        stopHandler.execute = async () => {
            executedStop = true;
        };

        let executedReplay = false;
        replayHandler.execute = async () => {
            executedReplay = true;
        };

        const handledStop = await router.handle({ customId: 'tts:stop' }, {});
        assert.equal(handledStop, true);
        assert.equal(executedStop, true);

        const handledReplay = await router.handle({ customId: 'tts:replay:abc789' }, {});
        assert.equal(handledReplay, true);
        assert.equal(executedReplay, true);
    });
});
