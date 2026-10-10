import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const playCommand = require('../src/commands/music/play').default || require('../src/commands/music/play');

describe('Play Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(playCommand.data.name, 'play');
        assert.equal(playCommand.data.dm_permission, false);
        assert.equal(playCommand.category, 'music');
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

        await playCommand.execute(mockInteraction, mockBot);
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
            member: { voice: { channel: null } }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
    });

    it('rejects execution when channel is not text-based', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            channel: null
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道錯誤');
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
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: { members: { me: null } }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
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
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => false })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /連線/);
    });

    it('rejects execution when bot is in a different voice channel', async () => {
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
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: { id: 'vc-bot' } }
                    }
                }
            }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '頻道衝突');
    });

    it('rejects execution when query is too short or too long', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const createInteraction = (q) => ({
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            options: {
                getString: () => q
            }
        });

        await playCommand.execute(createInteraction('a'), mockBot);
        assert.equal(sentError.title, '搜尋詞過短');

        await playCommand.execute(createInteraction('x'.repeat(501)), mockBot);
        assert.equal(sentError.title, '搜尋詞過長');
    });

    it('handles playlist URL cleanly and deletes deferred reply', async () => {
        let deferred = false;
        let deleted = false;
        let playedPlaylist = false;

        const mockMusic = {
            search: async (query) => ({
                isPlaylist: true,
                name: 'My Playlist',
                tracks: [{ info: { title: 'Track 1' } }]
            }),
            playPlaylist: async () => {
                playedPlaylist = true;
            }
        };

        const mockBot = {
            music: mockMusic
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            options: {
                getString: () => 'https://www.youtube.com/playlist?list=123'
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deleted = true;
            },
            user: { id: 'u-1', tag: 'User#1' }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(playedPlaylist, true);
        assert.equal(deleted, true);
    });

    it('handles direct song URL cleanly and deletes deferred reply', async () => {
        let deferred = false;
        let deleted = false;
        let playedSong = false;

        const mockMusic = {
            search: async (query) => ({
                isPlaylist: false,
                name: null,
                tracks: [{ info: { title: 'Single Track' } }]
            }),
            play: async () => {
                playedSong = true;
            }
        };

        const mockBot = {
            music: mockMusic
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            member: {
                voice: {
                    channel: {
                        id: 'vc-1',
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            options: {
                getString: () => 'https://www.youtube.com/watch?v=abc'
            },
            deferReply: async () => {
                deferred = true;
            },
            deleteReply: async () => {
                deleted = true;
            },
            user: { id: 'u-1', tag: 'User#1' }
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.equal(deferred, true);
        assert.equal(playedSong, true);
        assert.equal(deleted, true);
    });

    it('reports error when search yields no tracks', async () => {
        let sentError = null;
        const mockMusic = {
            search: async () => ({
                isPlaylist: false,
                tracks: []
            })
        };
        const mockBot = {
            music: mockMusic,
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
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            options: {
                getString: () => 'nonexistent song 12345'
            },
            deferReply: async () => {}
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '查無結果');
    });

    it('reports specific error message when search fails with error', async () => {
        let sentError = null;
        const mockMusic = {
            search: async () => ({
                isPlaylist: false,
                tracks: [],
                error: 'YouTube 限制：此曲目需要年齡驗證或登入帳號才能播放'
            })
        };
        const mockBot = {
            music: mockMusic,
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
                        permissionsFor: () => ({ has: () => true })
                    }
                }
            },
            channel: { isTextBased: () => true },
            guild: {
                members: {
                    me: {
                        id: 'bot-1',
                        voice: { channel: null }
                    }
                }
            },
            options: {
                getString: () => 'https://www.youtube.com/playlist?list=PL123'
            },
            deferReply: async () => {}
        };

        await playCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '載入失敗');
        assert.equal(sentError.desc, 'YouTube 限制：此曲目需要年齡驗證或登入帳號才能播放');
    });

    describe('Interactive Search Flow (Scheme A with True Headings)', () => {
        const createSearchTracks = () => [
            {
                info: {
                    title: 'Search Result 1',
                    author: 'Singer A',
                    length: 200000,
                    uri: 'https://youtube.com/watch?v=sr1',
                    identifier: 'sr1',
                    artworkUrl: 'https://img.youtube.com/vi/sr1/hqdefault.jpg'
                }
            },
            {
                info: {
                    title: 'Search Result 2',
                    author: 'Singer B',
                    length: 150000,
                    uri: 'https://youtube.com/watch?v=sr2'
                }
            }
        ];

        it('renders Scheme A card with True Headings and plays selected track', async () => {
            let replyPayload = null;
            let playedTrack = null;
            let deleted = false;

            const mockMusic = {
                search: async () => ({
                    isPlaylist: false,
                    tracks: createSearchTracks()
                }),
                play: async (vc, tc, track, user) => {
                    playedTrack = track;
                }
            };

            const mockBot = { music: mockMusic };

            let updatePayload = null;
            const mockComponentInteraction = {
                values: ['0'],
                update: async (payload) => {
                    updatePayload = payload;
                }
            };

            const mockResponse = {
                awaitMessageComponent: async () => mockComponentInteraction
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                member: {
                    voice: {
                        channel: {
                            id: 'vc-1',
                            permissionsFor: () => ({ has: () => true })
                        }
                    }
                },
                channel: { isTextBased: () => true },
                guild: {
                    members: {
                        me: { id: 'bot-1', voice: { channel: null } }
                    }
                },
                options: {
                    getString: () => 'Search Result'
                },
                deferReply: async () => {},
                editReply: async (payload) => {
                    replyPayload = payload;
                    return mockResponse;
                },
                deleteReply: async () => {
                    deleted = true;
                },
                user: { id: 'u-1', tag: 'User#1' }
            };

            await playCommand.execute(mockInteraction, mockBot);

            assert.ok(replyPayload);
            assert.ok(replyPayload.components);
            assert.equal(replyPayload.components.length, 2);

            const containerJson = JSON.stringify(replyPayload.components[0].toJSON());
            // Verify True Level 1 Heading
            assert.match(containerJson, /# 🔍 音樂搜尋結果/);
            // Verify Hero Level 2 Heading
            assert.match(containerJson, /## \[Search Result 1\]/);
            // Verify Candidate Level 3 Heading
            assert.match(containerJson, /### 更多候選曲目/);
            assert.match(containerJson, /Search Result 2/);

            // Verify processing state used True Heading
            assert.ok(updatePayload);
            const updateJson = JSON.stringify(updatePayload.components[0].toJSON());
            assert.match(updateJson, /# ⌛ 正在加入播放佇列\.\.\./);

            // Verify playback invoked and reply deleted
            assert.equal(playedTrack.info.title, 'Search Result 1');
            assert.equal(deleted, true);
        });

        it('handles search timeout and updates message with True Heading (# ⏰)', async () => {
            let editPayload = null;
            const mockMusic = {
                search: async () => ({
                    isPlaylist: false,
                    tracks: createSearchTracks()
                })
            };

            const mockBot = { music: mockMusic };

            const mockResponse = {
                awaitMessageComponent: async () => {
                    throw new Error('time');
                },
                edit: async (payload) => {
                    editPayload = payload;
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                member: {
                    voice: {
                        channel: {
                            id: 'vc-1',
                            permissionsFor: () => ({ has: () => true })
                        }
                    }
                },
                channel: { isTextBased: () => true },
                guild: {
                    members: {
                        me: { id: 'bot-1', voice: { channel: null } }
                    }
                },
                options: {
                    getString: () => 'Search Result'
                },
                deferReply: async () => {},
                editReply: async () => mockResponse,
                user: { id: 'u-1', tag: 'User#1' }
            };

            await playCommand.execute(mockInteraction, mockBot);

            assert.ok(editPayload);
            const timeoutJson = JSON.stringify(editPayload.components[0].toJSON());
            assert.match(timeoutJson, /# ⏰ 選擇已逾時或取消/);
            assert.match(timeoutJson, /-# 超過 25 秒未進行選擇/);
        });
    });
});
