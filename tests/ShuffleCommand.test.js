import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const shuffleCommand = require('../src/commands/music/shuffle').default || require('../src/commands/music/shuffle');

describe('Shuffle Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(shuffleCommand.data.name, 'shuffle');
        assert.equal(shuffleCommand.data.dm_permission, false);
        assert.equal(shuffleCommand.category, 'music');
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

        await shuffleCommand.execute(mockInteraction, mockBot);
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

        await shuffleCommand.execute(mockInteraction, mockBot);
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

        await shuffleCommand.execute(mockInteraction, mockBot);
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

        await shuffleCommand.execute(mockInteraction, mockBot);
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
                    size: 0
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

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects execution when queue has only 1 song (size = 1, no queued songs)', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    size: 1
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

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列不足');
        assert.match(sentError.desc, /至少需要 2 首待播歌曲/);
    });

    it('rejects execution when queue has 2 songs (size = 2, only 1 queued song)', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    size: 2
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

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列不足');
        assert.match(sentError.desc, /至少需要 2 首待播歌曲/);
    });

    it('successfully shuffles when queue has 3 or more songs', async () => {
        let shuffleCalled = false;
        let repliedOpts = null;

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    size: 3,
                    shuffle: () => {
                        shuffleCalled = true;
                    }
                })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            reply: async (opts) => {
                repliedOpts = opts;
            }
        };

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.equal(shuffleCalled, true);
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components);
    });

    it('renders Scheme 3 action console card with preview and buttons when queue has songs', async () => {
        let repliedOpts = null;
        const mockSongs = [
            { title: 'Current Song', duration: 180000, url: 'https://example.com/1' },
            { title: 'Next Song A', duration: 200000, url: 'https://example.com/2' },
            { title: 'Next Song B', duration: 150000, url: 'https://example.com/3' }
        ];

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    size: 3,
                    songs: mockSongs,
                    shuffle: () => {}
                }),
                formatDuration: () => '03:20'
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

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components && repliedOpts.components.length === 1);
        const container = repliedOpts.components[0];
        const data = container.toJSON ? container.toJSON() : container;
        assert.ok(data.components);
        const hasActionRow = data.components.some((c) => c.type === 1);
        assert.equal(hasActionRow, true);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    size: 4,
                    shuffle: () => {
                        throw new Error('Unexpected shuffle failure');
                    }
                })
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

        await shuffleCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '打亂失敗');
    });
});
