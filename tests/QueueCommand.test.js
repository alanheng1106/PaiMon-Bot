import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const queueCommand = require('../src/commands/music/queue').default || require('../src/commands/music/queue');

describe('Queue Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(queueCommand.data.name, 'queue');
        assert.equal(queueCommand.data.dm_permission, false);
        assert.equal(queueCommand.category, 'music');
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

        await queueCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('returns error when queue is empty or has no songs', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({ songs: [] })
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' }
        };

        await queueCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('renders queue correctly with tracks and valid thumbnail', async () => {
        let deferred = false;
        let followedUpPayload = null;

        const mockSongs = [
            {
                title: 'Test Song 1',
                duration: 180000,
                thumbnail: 'https://example.com/thumb.jpg',
                requester: { id: 'user-1' }
            },
            {
                title: 'Test Song 2',
                duration: 240000,
                thumbnail: 'https://example.com/thumb2.jpg',
                requester: { id: 'user-2' }
            }
        ];

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                followedUpPayload = payload;
            },
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => ({ songs: mockSongs }),
                formatDuration: (ms) => `${Math.floor(ms / 1000)}s`
            }
        };

        await queueCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(followedUpPayload);
        assert.ok(followedUpPayload.components);

        const container = followedUpPayload.components[0];
        const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);
        assert.match(jsonStr, /# 📜 播放清單佇列/);
        assert.match(jsonStr, /## ▶️ 正在播放/);
        assert.match(jsonStr, /Test Song 1/);
        assert.match(jsonStr, /### ⏳ 即將播放/);
        assert.match(jsonStr, /Test Song 2/);
        assert.match(jsonStr, /music:toggle_pause/);
        assert.match(jsonStr, /music:skip/);
    });

    it('gracefully handles songs with empty thumbnail without throwing', async () => {
        let deferred = false;
        let followedUpPayload = null;

        const mockSongs = [
            {
                title: 'TTS Track Without Thumbnail',
                duration: 5000,
                thumbnail: '',
                requester: { id: 'user-tts' }
            }
        ];

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {
                deferred = true;
            },
            editReply: async (payload) => {
                followedUpPayload = payload;
            },
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => ({ songs: mockSongs }),
                formatDuration: (ms) => `${Math.floor(ms / 1000)}s`
            }
        };

        await queueCommand.execute(mockInteraction, mockBot);

        assert.equal(deferred, true);
        assert.ok(followedUpPayload);
        assert.ok(followedUpPayload.components);
    });

    it('handles queue with more than 10 songs by displaying excess count', async () => {
        let followedUpPayload = null;

        const mockSongs = Array.from({ length: 15 }, (_, i) => ({
            title: `Song ${i + 1}`,
            duration: 60000,
            thumbnail: '',
            requester: { id: `user-${i}` }
        }));

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {},
            editReply: async (payload) => {
                followedUpPayload = payload;
            },
            followUp: async (payload) => {
                followedUpPayload = payload;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => ({ songs: mockSongs }),
                formatDuration: (ms) => `${Math.floor(ms / 1000)}s`
            }
        };

        await queueCommand.execute(mockInteraction, mockBot);
        assert.ok(followedUpPayload);
    });

    it('catches and reports unexpected exceptions cleanly', async () => {
        let sentError = null;

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            deferReply: async () => {
                throw new Error('Discord API Network Timeout');
            }
        };

        const mockBot = {
            music: {
                getQueue: () => ({
                    songs: [{ title: 'Track', duration: 1000, thumbnail: '', requester: { id: '1' } }]
                }),
                formatDuration: () => '1s'
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        await queueCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '讀取失敗');
    });
});
