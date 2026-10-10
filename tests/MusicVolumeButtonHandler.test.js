import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicVolumeButtonHandler =
    require('../src/core/components/MusicVolumeButtonHandler').default ||
    require('../src/core/components/MusicVolumeButtonHandler');

describe('MusicVolumeButtonHandler', () => {
    const handler = new MusicVolumeButtonHandler();

    it('matches customId prefix music:volume', () => {
        assert.equal(handler.customId, 'music:volume');
        assert.equal(handler.matches('music:volume:down:10'), true);
        assert.equal(handler.matches('music:volume:up:10'), true);
        assert.equal(handler.matches('music:volume:set:50'), true);
        assert.equal(handler.matches('music:volume'), true);
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
            customId: 'music:volume:down:10'
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
            customId: 'music:volume:down:10',
            member: { voice: { channel: null } }
        };

        await handler.execute(mockInteraction, mockBot);
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
            customId: 'music:volume:down:10',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: { me: { voice: { channel: null } } }
            }
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
            customId: 'music:volume:down:10',
            member: { voice: { channel: { id: 'vc-user' } } },
            guild: {
                members: { me: { voice: { channel: { id: 'vc-bot' } } } }
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
            customId: 'music:volume:down:10',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects invalid action in customId', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({ isEmpty: () => false })
            },
            settings: {
                get: () => 50
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            customId: 'music:volume:unknown:10',
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await handler.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '參數無效');
    });

    it('handles down, up, and set actions with bounds clamping and updates in-place', async () => {
        let setVolumeCalls = [];
        let persistedSettings = [];
        let updatePayload = null;

        let currentVol = 50;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    songs: [{ title: 'Current Jam' }]
                }),
                setVolume: (guildId, vol) => {
                    setVolumeCalls.push({ guildId, vol });
                    currentVol = vol;
                }
            },
            settings: {
                get: (guildId, key, fallback) => currentVol,
                set: (guildId, key, val) => {
                    persistedSettings.push({ guildId, key, val });
                }
            }
        };

        const createInteraction = (customId) => ({
            inCachedGuild: () => true,
            customId,
            user: { id: 'user-btn' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-btn',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            update: async (payload) => {
                updatePayload = payload;
            }
        });

        // 1. down:10 from 50 -> 40
        await handler.execute(createInteraction('music:volume:down:10'), mockBot);
        assert.deepEqual(setVolumeCalls.at(-1), { guildId: 'guild-btn', vol: 40 });
        assert.deepEqual(persistedSettings.at(-1), { guildId: 'guild-btn', key: 'volume', val: 40 });
        assert.ok(updatePayload);
        let str = JSON.stringify(updatePayload.components[0].toJSON());
        assert.match(str, /# 🎛️ 音量控制台/);
        assert.match(str, /40%/);
        assert.doesNotMatch(str, /💡/);

        // 2. set:50 from 40 -> 50
        await handler.execute(createInteraction('music:volume:set:50'), mockBot);
        assert.deepEqual(setVolumeCalls.at(-1), { guildId: 'guild-btn', vol: 50 });

        // 3. up:10 from 50 -> 60
        await handler.execute(createInteraction('music:volume:up:10'), mockBot);
        assert.deepEqual(setVolumeCalls.at(-1), { guildId: 'guild-btn', vol: 60 });

        // 4. Test bottom clamp at 1
        currentVol = 5;
        await handler.execute(createInteraction('music:volume:down:10'), mockBot);
        assert.deepEqual(setVolumeCalls.at(-1), { guildId: 'guild-btn', vol: 1 });

        // 5. Test top clamp at 100
        currentVol = 95;
        await handler.execute(createInteraction('music:volume:up:10'), mockBot);
        assert.deepEqual(setVolumeCalls.at(-1), { guildId: 'guild-btn', vol: 100 });
    });
});
