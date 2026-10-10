import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const stopModule = require('../src/commands/music/stop');
const stopCommand = stopModule.default || stopModule;
const { buildStopCard } = stopModule;

describe('Stop Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(stopCommand.data.name, 'stop');
        assert.equal(stopCommand.data.dm_permission, false);
        assert.equal(stopCommand.category, 'music');
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

        await stopCommand.execute(mockInteraction, mockBot);
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

        await stopCommand.execute(mockInteraction, mockBot);
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

        await stopCommand.execute(mockInteraction, mockBot);
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

        await stopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('rejects execution when queue is empty or nonexistent', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => null
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

        await stopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');

        // Test with queue returning isEmpty() === true
        sentError = null;
        mockBot.music.getQueue = () => ({ isEmpty: () => true });
        await stopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('stops playback and replies successfully when active', async () => {
        let stoppedGuildId = null;
        let repliedOpts = null;

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false
                }),
                stop: (guildId) => {
                    stoppedGuildId = guildId;
                }
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

        await stopCommand.execute(mockInteraction, mockBot);

        assert.equal(stoppedGuildId, 'guild-1');
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false
                }),
                stop: () => {
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

        await stopCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '停止失敗');
    });

    it('buildStopCard generates a valid CV2 container with action buttons and clear text', () => {
        assert.equal(typeof buildStopCard, 'function');
        const card = buildStopCard({
            clearedCount: 3,
            voiceChannelId: 'vc-123',
            executorId: 'user-456'
        });

        assert.ok(card.components);
        assert.equal(card.components.length, 1);
        const container = card.components[0];
        assert.ok(container);
    });
});
