import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicPauseButtonHandler =
    require('../src/core/components/MusicPauseButtonHandler').default ||
    require('../src/core/components/MusicPauseButtonHandler');
const MusicSkipButtonHandler =
    require('../src/core/components/MusicSkipButtonHandler').default ||
    require('../src/core/components/MusicSkipButtonHandler');
const MusicLoopButtonHandler =
    require('../src/core/components/MusicLoopButtonHandler').default ||
    require('../src/core/components/MusicLoopButtonHandler');
const MusicQueueButtonHandler =
    require('../src/core/components/MusicQueueButtonHandler').default ||
    require('../src/core/components/MusicQueueButtonHandler');

describe('Scheme B Music Control Button Handlers', () => {
    describe('MusicPauseButtonHandler', () => {
        const handler = new MusicPauseButtonHandler();

        it('matches customId toggle_pause, pause, and resume', () => {
            assert.equal(handler.customId, 'music:toggle_pause');
            assert.equal(handler.matches('music:toggle_pause'), true);
            assert.equal(handler.matches('music:pause'), true);
            assert.equal(handler.matches('music:resume'), true);
            assert.equal(handler.matches('music:skip'), false);
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
                customId: 'music:toggle_pause'
            };

            await handler.execute(mockInteraction, mockBot);
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
                customId: 'music:toggle_pause',
                member: { voice: { channel: null } }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '語音連線遭拒');
        });

        it('rejects execution when bot is not connected to voice', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: { members: { me: { voice: { channel: null } } } }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '無連線');
        });

        it('rejects execution when user is in a different voice channel', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-user' } } },
                guild: { members: { me: { voice: { channel: { id: 'vc-bot' } } } } }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '不在同一頻道');
        });

        it('rejects execution when queue is empty', async () => {
            let sentError = null;
            const mockBot = {
                music: {
                    getQueue: () => null
                },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '佇列為空');
        });

        it('pauses active playback and updates card with paused state', async () => {
            let pausedGuildId = null;
            let updatedPayload = null;

            const mockSong = {
                title: 'Active Track',
                author: 'Artist',
                duration: 180000,
                requester: { id: 'user-1' }
            };

            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                player: { paused: false, position: 20000 },
                voiceChannelId: 'vc-1',
                loopMode: 'none'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    pause: (gid) => {
                        pausedGuildId = gid;
                    },
                    createProgressBar: () => '`00:20` [🔘————] `03:00`',
                    formatDuration: () => '3:00'
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                },
                update: async (payload) => {
                    updatedPayload = payload;
                }
            };

            await handler.execute(mockInteraction, mockBot);

            assert.equal(pausedGuildId, 'guild-123');
            assert.ok(updatedPayload);
            const container = updatedPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            assert.equal(data.accent_color, 0xfee75c); // Amber Yellow for paused
            assert.match(JSON.stringify(data), /# ⏸️ 已暫停播放/);
        });

        it('resumes paused playback and updates card with playing state', async () => {
            let resumedGuildId = null;
            let updatedPayload = null;

            const mockSong = {
                title: 'Paused Track',
                author: 'Artist',
                duration: 180000,
                requester: { id: 'user-1' }
            };

            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                player: { paused: true, position: 40000 },
                voiceChannelId: 'vc-1',
                loopMode: 'none'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    resume: (gid) => {
                        resumedGuildId = gid;
                    },
                    createProgressBar: () => '`00:40` [🔘————] `03:00`',
                    formatDuration: () => '3:00'
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                },
                update: async (payload) => {
                    updatedPayload = payload;
                }
            };

            await handler.execute(mockInteraction, mockBot);

            assert.equal(resumedGuildId, 'guild-123');
            assert.ok(updatedPayload);
            const container = updatedPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            assert.match(JSON.stringify(data), /# ▶️ 正在播放/);
        });

        it('catches and reports unexpected errors cleanly', async () => {
            let sentError = null;
            const mockBot = {
                music: {
                    getQueue: () => {
                        throw new Error('Database Error');
                    }
                },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:toggle_pause',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '操作失敗');
        });
    });

    describe('MusicSkipButtonHandler', () => {
        const handler = new MusicSkipButtonHandler();

        it('matches customId music:skip', () => {
            assert.equal(handler.customId, 'music:skip');
            assert.equal(handler.matches('music:skip'), true);
            assert.equal(handler.matches('music:toggle_pause'), false);
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
                customId: 'music:skip'
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
                customId: 'music:skip',
                member: { voice: { channel: null } }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '語音連線遭拒');
        });

        it('skips track, resets single track loop, and sends success notice', async () => {
            let skippedGuildId = null;
            let successTitle = null;
            let successDesc = null;

            const mockSong = {
                title: 'Skipped Track',
                author: 'Artist'
            };

            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                loopMode: 'track',
                setLoopMode: (m) => {
                    mockQueue.loopMode = m;
                }
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    skip: (gid) => {
                        skippedGuildId = gid;
                    }
                },
                sendSuccess: async (interaction, title, desc) => {
                    successTitle = title;
                    successDesc = desc;
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:skip',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                }
            };

            await handler.execute(mockInteraction, mockBot);

            assert.equal(mockQueue.loopMode, 'none'); // Reset track loop
            assert.equal(skippedGuildId, 'guild-123');
            assert.equal(successTitle, '⏭️ 跳過歌曲');
            assert.match(successDesc, /Skipped Track/);
        });

        it('catches and reports unexpected skip errors cleanly', async () => {
            let sentError = null;
            const mockBot = {
                music: {
                    getQueue: () => {
                        throw new Error('Lavalink Connection Lost');
                    }
                },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:skip',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '跳過失敗');
        });
    });

    describe('MusicLoopButtonHandler - music:loop:cycle', () => {
        const handler = new MusicLoopButtonHandler();

        it('cycles loop mode from none -> track and updates NowPlaying card in-place', async () => {
            let updatedPayload = null;
            const mockSong = {
                title: 'Cycling Song',
                author: 'Cycling Artist',
                duration: 120000,
                requester: { id: 'user-777' }
            };

            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                loopMode: 'none',
                setLoopMode: (m) => {
                    mockQueue.loopMode = m;
                },
                player: { position: 10000, paused: false },
                voiceChannelId: 'vc-1'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    createProgressBar: () => '`00:10` [🔘————] `02:00`',
                    formatDuration: () => '2:00'
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:loop:cycle',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                },
                update: async (payload) => {
                    updatedPayload = payload;
                }
            };

            await handler.execute(mockInteraction, mockBot);

            assert.equal(mockQueue.loopMode, 'track');
            assert.ok(updatedPayload);
            const container = updatedPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            // NowPlaying card should be returned
            assert.match(JSON.stringify(data), /# ▶️ 正在播放/);
            assert.match(JSON.stringify(data), /Cycling Song/);
        });

        it('cycles loop mode from track -> queue', async () => {
            const mockSong = { title: 'Cycling Song', author: 'Artist', duration: 120000 };
            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                loopMode: 'track',
                setLoopMode: (m) => {
                    mockQueue.loopMode = m;
                },
                player: { position: 0, paused: false },
                voiceChannelId: 'vc-1'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    createProgressBar: () => '',
                    formatDuration: () => ''
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:loop:cycle',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                },
                update: async () => {}
            };

            await handler.execute(mockInteraction, mockBot);
            assert.equal(mockQueue.loopMode, 'queue');
        });

        it('cycles loop mode from queue -> none', async () => {
            const mockSong = { title: 'Cycling Song', author: 'Artist', duration: 120000 };
            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                loopMode: 'queue',
                setLoopMode: (m) => {
                    mockQueue.loopMode = m;
                },
                player: { position: 0, paused: false },
                voiceChannelId: 'vc-1'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    createProgressBar: () => '',
                    formatDuration: () => ''
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:loop:cycle',
                member: { voice: { channel: { id: 'vc-1' } } },
                guild: {
                    id: 'guild-123',
                    members: { me: { voice: { channel: { id: 'vc-1' } } } }
                },
                update: async () => {}
            };

            await handler.execute(mockInteraction, mockBot);
            assert.equal(mockQueue.loopMode, 'none');
        });
    });

    describe('MusicQueueButtonHandler - music:queue:view', () => {
        const handler = new MusicQueueButtonHandler();

        it('matches customId music:queue:view and music:queue', () => {
            assert.equal(handler.customId, 'music:queue:view');
            assert.equal(handler.matches('music:queue:view'), true);
            assert.equal(handler.matches('music:queue'), true);
            assert.equal(handler.matches('music:skip'), false);
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
                customId: 'music:queue:view'
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '無法執行');
        });

        it('rejects execution when queue is empty', async () => {
            let sentError = null;
            const mockBot = {
                music: {
                    getQueue: () => null
                },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:queue:view',
                guild: { id: 'guild-123' }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '佇列為空');
        });

        it('successfully replies with queue dashboard card', async () => {
            let deferred = false;
            let editedPayload = null;

            const mockSong = { title: 'Queued Song', author: 'Artist', duration: 180000 };
            const mockQueue = {
                isEmpty: () => false,
                songs: [mockSong],
                player: { paused: false },
                voiceChannelId: 'vc-1'
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    formatDuration: () => '03:00'
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                customId: 'music:queue:view',
                guild: { id: 'guild-123' },
                member: { voice: { channelId: 'vc-1' } },
                deferReply: async () => {
                    deferred = true;
                },
                editReply: async (payload) => {
                    editedPayload = payload;
                }
            };

            await handler.execute(mockInteraction, mockBot);
            assert.equal(deferred, true);
            assert.ok(editedPayload);
            assert.ok(editedPayload.components);
        });
    });
});
