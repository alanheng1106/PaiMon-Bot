import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const pauseCommand = require('../src/commands/music/pause').default || require('../src/commands/music/pause');

describe('Pause Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(pauseCommand.data.name, 'pause');
        assert.equal(pauseCommand.data.dm_permission, false);
        assert.equal(pauseCommand.category, 'music');
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

        await pauseCommand.execute(mockInteraction, mockBot);
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

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
    });

    it('rejects execution when bot is not in a voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: { members: { me: { voice: { channel: null } } } }
        };

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
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
            member: { voice: { channel: { id: 'vc-user' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-bot' } } } }
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('rejects execution when queue is empty', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => ({
                    isEmpty: () => true,
                    player: { paused: false }
                })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects execution when player is already paused', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: true }
                })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /已經處於暫停狀態/);
    });

    it('pauses playback and replies successfully when active', async () => {
        let pausedGuildId = null;
        let repliedOpts = null;

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: false, position: 65000 },
                    currentSong: {
                        title: 'A Very Long Song Title That Exceeds Thirty Characters Easily',
                        author: 'Test Artist',
                        duration: 180000,
                        thumbnail: 'https://img.youtube.com/vi/test/hqdefault.jpg',
                        url: 'https://youtube.com/watch?v=test'
                    }
                }),
                pause: (guildId) => {
                    pausedGuildId = guildId;
                }
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'user-123' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            reply: async (opts) => {
                repliedOpts = opts;
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);

        assert.equal(pausedGuildId, 'guild-1');
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components && repliedOpts.components.length > 0);

        const containerData = repliedOpts.components[0].toJSON
            ? repliedOpts.components[0].toJSON()
            : repliedOpts.components[0].data;
        // Verify Scheme B Accent Color is Amber Yellow (0xfee75c)
        assert.equal(containerData.accent_color, 0xfee75c);

        // Verify JSON string contains Scheme B elements: pause header, truncated title, buttons, subtext
        const jsonStr = JSON.stringify(containerData);
        assert.match(jsonStr, /# ⏸️ 播放已暫停/);
        assert.match(jsonStr, /A Very Long Song Title That/);
        assert.match(jsonStr, /\.\.\./); // Truncated
        assert.match(jsonStr, /Test Artist/);
        assert.match(jsonStr, /music:toggle_pause/);
        assert.match(jsonStr, /music:skip/);
        assert.match(jsonStr, /hqdefault\.jpg/);
        assert.match(jsonStr, /-# 👤 操作者：<@user-123>/);

        const subtextIndex = jsonStr.indexOf('操作者：<@user-123>');
        const buttonIndex = jsonStr.indexOf('music:toggle_pause');
        assert.ok(subtextIndex < buttonIndex, 'Subtext should be rendered above action buttons');
    });

    it('falls back gracefully when currentSong has no thumbnail', async () => {
        let repliedOpts = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: false, position: 10000 },
                    currentSong: {
                        title: 'Short Track',
                        author: 'Solo Singer',
                        duration: 60000,
                        thumbnail: null
                    }
                }),
                pause: () => {}
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'user-456' },
            member: { voice: { channel: { id: 'vc-2' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-2' } } } }
            },
            reply: async (opts) => {
                repliedOpts = opts;
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);
        assert.ok(repliedOpts);
        const jsonStr = JSON.stringify(
            repliedOpts.components[0].toJSON ? repliedOpts.components[0].toJSON() : repliedOpts.components[0].data
        );
        assert.match(jsonStr, /Short Track/);
        assert.match(jsonStr, /Solo Singer/);
        assert.match(jsonStr, /music:toggle_pause/);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: false }
                }),
                pause: () => {
                    throw new Error('Shoukaku Node connection lost');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await pauseCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '暫停失敗');
    });
});
