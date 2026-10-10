import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicDisconnectButtonHandler =
    require('../src/core/components/MusicDisconnectButtonHandler').default ||
    require('../src/core/components/MusicDisconnectButtonHandler');

describe('MusicDisconnectButtonHandler', () => {
    const handler = new MusicDisconnectButtonHandler();

    it('matches customId prefix music:disconnect:<channelId>', () => {
        assert.equal(handler.customId, 'music:disconnect');
        assert.equal(handler.matches('music:disconnect:vc-123'), true);
        assert.equal(handler.matches('music:disconnect'), true);
        assert.equal(handler.matches('music:rejoin'), false);
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
            customId: 'music:disconnect:vc-1'
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('rejects execution when bot is not connected to any voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:disconnect:vc-1',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無連線');
    });

    it('rejects execution when user is not in the same voice channel', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:disconnect:vc-1',
            member: { voice: { channel: { id: 'vc-different' } } },
            guild: {
                members: {
                    me: { voice: { channel: { id: 'vc-bot' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
        assert.match(sentError.desc, /vc-bot/);
    });

    it('successfully leaves voice channel and delivers disconnect card', async () => {
        let leftGuildId = null;
        let repliedPayload = null;

        const mockBot = {
            music: {
                leave: (guildId) => {
                    leftGuildId = guildId;
                }
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:disconnect:vc-1',
            user: { id: 'user-op-1' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-100',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            },
            deferReply: async () => {
                mockInteraction.deferred = true;
            },
            editReply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.equal(leftGuildId, 'guild-100');
        assert.ok(repliedPayload);
        assert.equal(repliedPayload.flags, 32768);
        assert.ok(repliedPayload.components[0]);
    });

    it('catches and reports unexpected errors in music.leave', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                leave: () => {
                    throw new Error('Connection teardown error');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:disconnect:vc-1',
            user: { id: 'user-1' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-100',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            },
            deferReply: async () => {
                mockInteraction.deferred = true;
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '斷開失敗');
    });
});
