import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicLoopButtonHandler =
    require('../src/core/components/MusicLoopButtonHandler').default ||
    require('../src/core/components/MusicLoopButtonHandler');

describe('MusicLoopButtonHandler', () => {
    const handler = new MusicLoopButtonHandler();

    it('matches customId prefix music:loop:<mode>', () => {
        assert.equal(handler.customId, 'music:loop');
        assert.equal(handler.matches('music:loop:none'), true);
        assert.equal(handler.matches('music:loop:track'), true);
        assert.equal(handler.matches('music:loop:queue'), true);
        assert.equal(handler.matches('music:loop'), true);
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
            customId: 'music:loop:track'
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
            customId: 'music:loop:track',
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音連線遭拒');
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
            customId: 'music:loop:track',
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
            customId: 'music:loop:track',
            member: { voice: { channel: { id: 'vc-user' } } },
            guild: {
                members: {
                    me: { voice: { channel: { id: 'vc-bot' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('rejects execution when queue is empty or nonexistent', async () => {
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
            customId: 'music:loop:track',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-123',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects execution with invalid mode in customId', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false
                })
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:loop:invalid_mode',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-123',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '參數無效');
    });

    it('successfully updates loop mode and triggers in-place interaction.update', async () => {
        let updatedMode = null;
        let updatePayload = null;

        const mockQueue = {
            isEmpty: () => false,
            songs: [{ title: 'Special Track' }],
            voiceChannelId: 'vc-1',
            setLoopMode: (m) => {
                updatedMode = m;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => mockQueue
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:loop:queue',
            user: { id: 'user-888' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-123',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            },
            update: async (payload) => {
                updatePayload = payload;
            }
        };

        await handler.execute(mockInteraction, mockBot);

        assert.equal(updatedMode, 'queue');
        assert.ok(updatePayload);
        assert.equal(updatePayload.components.length, 1);

        const containerData = updatePayload.components[0].toJSON
            ? updatePayload.components[0].toJSON()
            : updatePayload.components[0];
        const jsonStr = JSON.stringify(containerData);

        // Heading 1 & metadata
        assert.match(jsonStr, /# 🎛️ 音樂循環控制台/);
        assert.match(jsonStr, /Special Track/);
        assert.match(jsonStr, /user-888/);
        assert.equal(containerData.accent_color, 0x57f287); // Vibrant Green for queue
    });

    it('catches and reports unexpected exceptions cleanly', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    setLoopMode: () => {
                        throw new Error('Unexpected Queue Failure');
                    }
                })
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:loop:track',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-123',
                members: {
                    me: { voice: { channel: { id: 'vc-1' } } }
                }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '切換失敗');
    });
});
