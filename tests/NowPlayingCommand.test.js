import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const nowPlayingCommand =
    require('../src/commands/music/nowplaying').default || require('../src/commands/music/nowplaying');

describe('NowPlaying Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(nowPlayingCommand.data.name, 'nowplaying');
        assert.equal(nowPlayingCommand.data.dm_permission, false);
        assert.equal(nowPlayingCommand.category, 'music');
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

        await nowPlayingCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('returns error when queue is empty', async () => {
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
            guild: { id: 'guild-123' }
        };

        await nowPlayingCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無播放內容');
    });

    it('successfully defers and renders now playing for active track', async () => {
        let deferred = false;
        let followedUpPayload = null;

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {
                deferred = true;
            },
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockSong = {
            title: 'Radical Dreamers',
            author: 'Chrono Cross',
            duration: 180000,
            thumbnail: 'https://example.com/cover.jpg',
            url: 'https://example.com/stream',
            requester: { id: 'user-777' }
        };

        const mockBot = {
            music: {
                getQueue: () => ({
                    songs: [mockSong],
                    player: { position: 45000 },
                    voiceChannelId: 'vc-999'
                }),
                formatDuration: (ms) => '3:00',
                createProgressBar: (curr, total) => '`0:45` [▇▇🔘———] `3:00`'
            },
            sendError: async () => {}
        };

        await nowPlayingCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(followedUpPayload);
        assert.ok(followedUpPayload.components);
    });

    it('handles livestream (duration = 0) without throwing RangeError', async () => {
        let followedUpPayload = null;

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {},
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockSong = {
            title: 'Lofi Girl Live Radio',
            author: 'Lofi Girl',
            duration: 0,
            thumbnail: '',
            url: 'https://youtube.com/watch?v=live',
            requester: { id: 'user-777' }
        };

        const mockBot = {
            music: {
                getQueue: () => ({
                    songs: [mockSong],
                    player: { position: 120000 },
                    voiceChannelId: 'vc-999'
                }),
                formatDuration: (ms) => (ms === 0 ? '直播流' : '2:00'),
                createProgressBar: (curr, total) => '🔴 直播流'
            },
            sendError: async () => {}
        };

        await nowPlayingCommand.execute(mockInteraction, mockBot);

        assert.ok(followedUpPayload);
        assert.ok(followedUpPayload.components);
    });

    it('handles track with empty thumbnail and url gracefully', async () => {
        let followedUpPayload = null;

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {},
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockSong = {
            title: 'TTS Message',
            author: 'Google TTS',
            duration: 5000,
            thumbnail: '',
            url: '',
            requester: { id: 'user-777' }
        };

        const mockBot = {
            music: {
                getQueue: () => ({
                    songs: [mockSong],
                    player: null,
                    voiceChannelId: 'vc-999'
                }),
                formatDuration: (ms) => '0:05',
                createProgressBar: (curr, total) => '`0:00` [🔘————] `0:05`'
            },
            sendError: async () => {}
        };

        await nowPlayingCommand.execute(mockInteraction, mockBot);

        assert.ok(followedUpPayload);
        assert.ok(followedUpPayload.components);
    });

    it('catches unexpected exceptions with outer try-catch and reports error', async () => {
        let sentError = null;

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {
                throw new Error('Discord Gateway Drop');
            }
        };

        const mockBot = {
            music: {
                getQueue: () => ({
                    songs: [{ title: 'Track', author: 'Artist', duration: 1000, requester: { id: '1' } }]
                })
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        await nowPlayingCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '查詢失敗');
    });

    describe('Scheme B Interactive Console Specifications', () => {
        it('renders status header H1, balanced section, full-width progress bar, and 5 action buttons', async () => {
            let followedUpPayload = null;
            const mockSong = {
                title: 'Shape of You',
                author: 'Ed Sheeran',
                duration: 233000,
                thumbnail: 'https://example.com/cover.jpg',
                url: 'https://example.com/track',
                requester: { id: 'user-123' }
            };

            const mockBot = {
                music: {
                    getQueue: () => ({
                        songs: [mockSong],
                        player: { position: 60000, paused: false },
                        voiceChannelId: 'vc-777',
                        loopMode: 'none'
                    }),
                    formatDuration: () => '3:53',
                    createProgressBar: () => '`01:00` [▇▇🔘——————] `03:53`'
                },
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                deferReply: async () => {},
                followUp: async (payload) => {
                    followedUpPayload = payload;
                }
            };

            await nowPlayingCommand.execute(mockInteraction, mockBot);

            assert.ok(followedUpPayload);
            const container = followedUpPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            const jsonStr = JSON.stringify(data);

            // 1. H1 Status Header
            assert.match(jsonStr, /# ▶️ 正在播放/);
            // 2. H2 Track title link
            assert.match(jsonStr, /## \[Shape of You\]\(https:\/\/example\.com\/track\)/);
            // 3. Author & Duration
            assert.match(jsonStr, /Ed Sheeran/);
            // 4. Full-width progress bar
            assert.match(jsonStr, /`01:00` \[▇▇🔘——————\] `03:53`/);
            // 5. ActionRow buttons
            assert.match(jsonStr, /music:toggle_pause/);
            assert.match(jsonStr, /music:skip/);
            assert.match(jsonStr, /music:loop:cycle/);
            assert.match(jsonStr, /music:open_play_modal/);
            assert.match(jsonStr, /https:\/\/example\.com\/track/);
            // 6. Subtext footer
            assert.match(jsonStr, /-# 👤 點播者：<@user-123>/);
            assert.match(jsonStr, /<#vc-777>/);
        });

        it('renders paused status with amber color and resume label when player is paused', async () => {
            let followedUpPayload = null;
            const mockSong = {
                title: 'Stay',
                author: 'The Kid LAROI',
                duration: 141000,
                thumbnail: 'https://example.com/stay.jpg',
                url: '',
                requester: { id: 'user-456' }
            };

            const mockBot = {
                music: {
                    getQueue: () => ({
                        songs: [mockSong],
                        player: { position: 30000, paused: true },
                        voiceChannelId: 'vc-777',
                        loopMode: 'none'
                    }),
                    formatDuration: () => '2:21',
                    createProgressBar: () => '`00:30` [▇🔘————] `02:21`'
                },
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                deferReply: async () => {},
                followUp: async (payload) => {
                    followedUpPayload = payload;
                }
            };

            await nowPlayingCommand.execute(mockInteraction, mockBot);

            assert.ok(followedUpPayload);
            const container = followedUpPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            const jsonStr = JSON.stringify(data);

            assert.match(jsonStr, /# ⏸️ 已暫停播放/);
            assert.equal(data.accent_color, 0xfee75c); // Amber Yellow
            assert.match(jsonStr, /繼續/); // Button label indicates resume
        });

        it('renders next song title in footer subtext when queue has upcoming tracks', async () => {
            let followedUpPayload = null;
            const currentSong = {
                title: 'Song One',
                author: 'Artist One',
                duration: 180000,
                requester: { id: 'user-1' }
            };
            const nextSong = {
                title: 'Song Two - Upcoming Next',
                author: 'Artist Two',
                duration: 200000,
                requester: { id: 'user-2' }
            };

            const mockBot = {
                music: {
                    getQueue: () => ({
                        songs: [currentSong, nextSong],
                        player: { position: 10000, paused: false },
                        voiceChannelId: 'vc-777',
                        loopMode: 'queue'
                    }),
                    formatDuration: () => '3:00',
                    createProgressBar: () => '`00:10` [🔘————] `03:00`'
                },
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                deferReply: async () => {},
                followUp: async (payload) => {
                    followedUpPayload = payload;
                }
            };

            await nowPlayingCommand.execute(mockInteraction, mockBot);

            assert.ok(followedUpPayload);
            const container = followedUpPayload.components[0];
            const data = container.toJSON ? container.toJSON() : container;
            const jsonStr = JSON.stringify(data);

            assert.match(jsonStr, /下一首：\*\*Song Two - Upcoming Next\*\*/);
            assert.match(jsonStr, /佇列剩餘 \*\*1\*\* 首/);
        });
    });

    describe('Option 1: Dynamic Auto-Refresh Live Card', () => {
        it('starts auto-refresh timer on track with positive duration and cancels previous timer', async () => {
            let priorTimerCleared = false;
            const previousTimer = { id: 'prior-timer' };

            const mockSong = {
                title: 'Timered Song',
                author: 'Timer Artist',
                duration: 180000,
                requester: { id: 'user-1' }
            };

            const mockQueue = {
                songs: [mockSong],
                player: { position: 15000, paused: false },
                voiceChannelId: 'vc-1',
                loopMode: 'none',
                nowPlayingTimer: previousTimer,
                clearNowPlayingTimer: () => {
                    priorTimerCleared = true;
                    mockQueue.nowPlayingTimer = null;
                },
                setNowPlayingTimer: (t) => {
                    mockQueue.nowPlayingTimer = t;
                }
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    formatDuration: () => '3:00',
                    createProgressBar: () => '`00:15` [🔘————] `03:00`'
                },
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                deferReply: async () => {},
                followUp: async () => {}
            };

            await nowPlayingCommand.execute(mockInteraction, mockBot);

            assert.equal(priorTimerCleared, true);
            assert.ok(mockQueue.nowPlayingTimer);
            assert.notEqual(mockQueue.nowPlayingTimer, previousTimer);

            // Clean up timer
            clearInterval(mockQueue.nowPlayingTimer);
        });

        it('does not start timer for livestream (duration = 0)', async () => {
            const mockSong = {
                title: 'Live Radio',
                author: 'Live Artist',
                duration: 0,
                requester: { id: 'user-1' }
            };

            const mockQueue = {
                songs: [mockSong],
                player: { position: 5000, paused: false },
                voiceChannelId: 'vc-1',
                loopMode: 'none',
                nowPlayingTimer: null
            };

            const mockBot = {
                music: {
                    getQueue: () => mockQueue,
                    formatDuration: () => '直播流',
                    createProgressBar: () => '🔴 直播流'
                },
                sendError: async () => {}
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                deferReply: async () => {},
                followUp: async () => {}
            };

            await nowPlayingCommand.execute(mockInteraction, mockBot);

            assert.equal(mockQueue.nowPlayingTimer, null);
        });

        it('timer callback updates card via editReply during active playback', async () => {
            let capturedIntervalFn = null;
            let capturedIntervalMs = null;
            let editReplyPayload = null;

            const originalSetInterval = global.setInterval;
            global.setInterval = (fn, ms) => {
                capturedIntervalFn = fn;
                capturedIntervalMs = ms;
                return { unref: () => {} };
            };

            try {
                const mockSong = {
                    title: 'Active Stream',
                    author: 'Artist',
                    duration: 180000,
                    encoded: 'song-enc-1',
                    requester: { id: 'user-1' }
                };

                const mockQueue = {
                    songs: [mockSong],
                    player: { position: 10000, paused: false },
                    voiceChannelId: 'vc-1',
                    loopMode: 'none',
                    nowPlayingTimer: null
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        formatDuration: () => '3:00',
                        createProgressBar: (pos) => `pos:${pos}`
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {},
                    editReply: async (payload) => {
                        editReplyPayload = payload;
                    }
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);

                assert.ok(capturedIntervalFn);
                assert.equal(capturedIntervalMs, 5000); // 5000ms Discord Rate Limit safe interval

                // Advance player position and simulate interval tick
                mockQueue.player.position = 20000;
                await capturedIntervalFn();

                assert.ok(editReplyPayload);
                const container = editReplyPayload.components[0];
                const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);
                assert.match(jsonStr, /pos:20000/);
            } finally {
                global.setInterval = originalSetInterval;
            }
        });

        it('timer callback skips editReply when player is paused', async () => {
            let capturedIntervalFn = null;
            let editReplyCallCount = 0;

            const originalSetInterval = global.setInterval;
            global.setInterval = (fn, ms) => {
                capturedIntervalFn = fn;
                return { unref: () => {} };
            };

            try {
                const mockSong = {
                    title: 'Paused Stream',
                    author: 'Artist',
                    duration: 180000,
                    encoded: 'song-enc-2',
                    requester: { id: 'user-1' }
                };

                const mockQueue = {
                    songs: [mockSong],
                    player: { position: 10000, paused: true },
                    voiceChannelId: 'vc-1',
                    loopMode: 'none'
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        formatDuration: () => '3:00',
                        createProgressBar: () => ''
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {},
                    editReply: async () => {
                        editReplyCallCount++;
                    }
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);
                assert.ok(capturedIntervalFn);

                // Simulate interval tick while paused
                await capturedIntervalFn();
                assert.equal(editReplyCallCount, 0); // No editReply called when paused
            } finally {
                global.setInterval = originalSetInterval;
            }
        });

        it('timer callback terminates timer cleanly when track has finished or changed', async () => {
            let capturedIntervalFn = null;
            let clearedCount = 0;

            const originalSetInterval = global.setInterval;
            const originalClearInterval = global.clearInterval;
            global.setInterval = (fn) => {
                capturedIntervalFn = fn;
                return { id: 'active-timer', unref: () => {} };
            };
            global.clearInterval = () => {
                clearedCount++;
            };

            try {
                const mockSong = {
                    title: 'Current Song',
                    duration: 180000,
                    encoded: 'enc-current'
                };

                const mockQueue = {
                    songs: [mockSong],
                    player: { position: 5000, paused: false },
                    voiceChannelId: 'vc-1',
                    loopMode: 'none'
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        formatDuration: () => '',
                        createProgressBar: () => ''
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {}
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);
                assert.ok(capturedIntervalFn);

                // Simulate track changed
                mockQueue.songs = [{ title: 'Next Song', duration: 180000, encoded: 'enc-next' }];
                await capturedIntervalFn();

                assert.ok(clearedCount >= 1);
            } finally {
                global.setInterval = originalSetInterval;
                global.clearInterval = originalClearInterval;
            }
        });

        it('timer callback terminates timer when editReply throws Unknown Message error', async () => {
            let capturedIntervalFn = null;
            let clearedCount = 0;

            const originalSetInterval = global.setInterval;
            const originalClearInterval = global.clearInterval;
            global.setInterval = (fn) => {
                capturedIntervalFn = fn;
                return { id: 'active-timer-err', unref: () => {} };
            };
            global.clearInterval = () => {
                clearedCount++;
            };

            try {
                const mockSong = {
                    title: 'Deleted Message Song',
                    duration: 180000,
                    encoded: 'enc-del'
                };

                const mockQueue = {
                    songs: [mockSong],
                    player: { position: 5000, paused: false },
                    voiceChannelId: 'vc-1',
                    loopMode: 'none'
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        formatDuration: () => '',
                        createProgressBar: () => ''
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {},
                    editReply: async () => {
                        throw new Error('DiscordAPIError[10008]: Unknown Message');
                    }
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);
                assert.ok(capturedIntervalFn);

                // Run tick where editReply throws
                await capturedIntervalFn();

                assert.ok(clearedCount >= 1);
            } finally {
                global.setInterval = originalSetInterval;
                global.clearInterval = originalClearInterval;
            }
        });

        it('renders final frame at full duration (e.g. 3:27 - 3:27) before terminating when song finishes', async () => {
            let capturedIntervalFn = null;
            let clearedCount = 0;
            let finalPayload = null;

            const originalSetInterval = global.setInterval;
            const originalClearInterval = global.clearInterval;
            global.setInterval = (fn) => {
                capturedIntervalFn = fn;
                return { id: 'active-timer-final', unref: () => {} };
            };
            global.clearInterval = () => {
                clearedCount++;
            };

            try {
                const mockSong = {
                    title: 'Jing Yin Lian Ren',
                    author: 'Liyue',
                    duration: 207000, // 3:27
                    encoded: 'enc-jingyin'
                };

                const mockQueue = {
                    songs: [mockSong],
                    player: { position: 204000, paused: false }, // 3:24
                    voiceChannelId: 'vc-1',
                    loopMode: 'none',
                    setNowPlayingTimer: () => {},
                    clearNowPlayingTimer: () => {
                        clearedCount++;
                    }
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        createProgressBar: (curr, total) => `pos:${curr}/${total}`
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {},
                    editReply: async (payload) => {
                        finalPayload = payload;
                    }
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);
                assert.ok(capturedIntervalFn);

                // Simulate track reaching completion at 207000 (3:27)
                mockQueue.player.position = 207000;
                await capturedIntervalFn();

                // Verified that final frame was rendered at 207000/207000 rather than stopped at 3:24
                assert.ok(finalPayload);
                const container = finalPayload.components[0];
                const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);
                assert.match(jsonStr, /pos:207000\/207000/);
                assert.ok(clearedCount >= 1);
            } finally {
                global.setInterval = originalSetInterval;
                global.clearInterval = originalClearInterval;
            }
        });

        it('does not finalize or jump to end when TTS is playing and resumes updating when song continues', async () => {
            let capturedIntervalFn = null;
            let clearedCount = 0;
            const originalSetInterval = global.setInterval;
            const originalClearInterval = global.clearInterval;

            global.setInterval = (fn) => {
                capturedIntervalFn = fn;
                return { unref: () => {} };
            };
            global.clearInterval = () => {
                clearedCount++;
            };

            try {
                const mainSong = {
                    title: 'Cruel Angel Thesis',
                    author: 'Yoko Takahashi',
                    duration: 240000,
                    encoded: 'enc-eva'
                };
                const ttsSong = {
                    title: 'TTS Voice Prompt',
                    author: 'Google TTS',
                    duration: 3000,
                    encoded: 'enc-tts-1',
                    isTTS: true
                };
                const resumeSong = {
                    title: 'Cruel Angel Thesis',
                    author: 'Yoko Takahashi',
                    duration: 240000,
                    encoded: 'enc-eva',
                    resumePosition: 60000
                };

                let lastEditedPayload = null;
                const mockQueue = {
                    songs: [mainSong],
                    player: { position: 60000, paused: false },
                    voiceChannelId: 'vc-1',
                    loopMode: 'none',
                    setNowPlayingTimer: () => {},
                    clearNowPlayingTimer: () => {
                        clearedCount++;
                    }
                };

                const mockBot = {
                    music: {
                        getQueue: () => mockQueue,
                        createProgressBar: (curr, total) => `pos:${curr}/${total}`
                    },
                    sendError: async () => {}
                };

                const mockInteraction = {
                    inCachedGuild: () => true,
                    guild: { id: 'guild-123' },
                    deferReply: async () => {},
                    followUp: async () => {},
                    editReply: async (payload) => {
                        lastEditedPayload = payload;
                    }
                };

                await nowPlayingCommand.execute(mockInteraction, mockBot);
                assert.ok(capturedIntervalFn);
                // Reset clearedCount after command initialization clears prior timer
                clearedCount = 0;

                // 1. Normal interval tick while music plays
                mockQueue.player.position = 65000;
                await capturedIntervalFn();
                assert.ok(lastEditedPayload);
                let jsonStr = JSON.stringify(
                    lastEditedPayload.components[0].toJSON?.() || lastEditedPayload.components[0]
                );
                assert.match(jsonStr, /pos:65000\/240000/);
                assert.equal(clearedCount, 0);

                // 2. TTS interrupts! Queue now has [ ttsSong, resumeSong ]
                mockQueue.songs = [ttsSong, resumeSong];
                mockQueue.player.position = 1000;

                // Interval ticks during TTS broadcast
                lastEditedPayload = null;
                await capturedIntervalFn();

                // Verified: Finalizer NOT called, timer NOT cleared, card NOT jumped to 240000/240000
                assert.equal(clearedCount, 0, 'Must NOT clear timer during TTS interruption');
                assert.equal(lastEditedPayload, null, 'Must pause edits during TTS broadcast');

                // 3. TTS finishes! Queue shifts TTS song, so [ resumeSong ] is now playing
                mockQueue.songs = [resumeSong];
                mockQueue.player.position = 70000;

                // Interval ticks after resuming
                await capturedIntervalFn();
                assert.ok(lastEditedPayload);
                jsonStr = JSON.stringify(lastEditedPayload.components[0].toJSON?.() || lastEditedPayload.components[0]);
                assert.match(jsonStr, /pos:70000\/240000/, 'Must continue refreshing from resumed position');
                assert.equal(clearedCount, 0);

                // 4. Music actually finishes (queue empty or reached end)
                mockQueue.player.position = 240000;
                await capturedIntervalFn();
                assert.ok(clearedCount >= 1, 'Finalizer must run when track genuinely finishes');
            } finally {
                global.setInterval = originalSetInterval;
                global.clearInterval = originalClearInterval;
            }
        });
    });
});
