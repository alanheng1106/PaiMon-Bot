import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const volumeModule = require('../src/commands/music/volume');
const volumeCommand = volumeModule.default || volumeModule;
const buildVolumeCard = volumeModule.buildVolumeCard;

describe('Volume Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(volumeCommand.data.name, 'volume');
        assert.equal(volumeCommand.data.dm_permission, false);
        assert.equal(volumeCommand.category, 'music');

        const option = volumeCommand.data.options.find((opt) => opt.name === 'level');
        assert.ok(option, 'level option should exist');
        assert.equal(option.required, true);
        assert.equal(option.min_value, 1);
        assert.equal(option.max_value, 100);
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

        await volumeCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
        assert.equal(sentError.desc, '此指令僅能在伺服器內使用.');
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

        await volumeCommand.execute(mockInteraction, mockBot);
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

        await volumeCommand.execute(mockInteraction, mockBot);
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

        await volumeCommand.execute(mockInteraction, mockBot);
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

        await volumeCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');

        // Test with queue returning isEmpty() === true
        sentError = null;
        mockBot.music.getQueue = () => ({ isEmpty: () => true });
        await volumeCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('sets volume, updates settings, and replies successfully when active', async () => {
        let updatedVolume = null;
        let persistedSetting = null;
        let repliedOpts = null;

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false
                }),
                setVolume: (guildId, volume) => {
                    updatedVolume = { guildId, volume };
                }
            },
            settings: {
                set: (guildId, key, value) => {
                    persistedSetting = { guildId, key, value };
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
            options: {
                getInteger: (name, required) => {
                    if (name === 'level') return 75;
                    return null;
                }
            },
            reply: async (opts) => {
                repliedOpts = opts;
            }
        };

        await volumeCommand.execute(mockInteraction, mockBot);

        assert.deepEqual(updatedVolume, { guildId: 'guild-1', volume: 75 });
        assert.deepEqual(persistedSetting, { guildId: 'guild-1', key: 'volume', value: 75 });
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components && repliedOpts.components.length > 0);

        const containerData = repliedOpts.components[0].toJSON
            ? repliedOpts.components[0].toJSON()
            : repliedOpts.components[0].data;
        const jsonStr = JSON.stringify(containerData);

        // 1. True Level 1 Heading verification (#)
        assert.match(jsonStr, /# 🎛️ 音量控制台/);
        assert.doesNotMatch(jsonStr, /###.*音量調整/);

        // 2. Volume meter bar & percentage verification
        assert.match(jsonStr, /當前音量：`\[████████░░\]` \*\*75%\*\*/);

        // 3. Action buttons verification
        assert.match(jsonStr, /music:volume:down:10/);
        assert.match(jsonStr, /music:volume:set:50/);
        assert.match(jsonStr, /music:volume:up:10/);

        // 4. Verify lightbulb hint is removed
        assert.doesNotMatch(jsonStr, /💡/);
    });

    it('buildVolumeCard enforces true Heading 1 (#), button boundaries, and no lightbulb tip', () => {
        // Test boundary at volume = 1
        const cardMin = buildVolumeCard({ volume: 1 });
        const dataMin = cardMin.components[0].toJSON ? cardMin.components[0].toJSON() : cardMin.components[0].data;
        const strMin = JSON.stringify(dataMin);

        assert.match(strMin, /# 🎛️ 音量控制台/);
        assert.match(strMin, /當前音量：`\[░░░░░░░░░░\]` \*\*1%\*\*/);
        assert.doesNotMatch(strMin, /💡/);

        // Button down should be disabled at volume 1
        const actionRowMin = dataMin.components[4];
        assert.equal(actionRowMin.components[0].disabled, true);

        // Test boundary at volume = 50
        const card50 = buildVolumeCard({ volume: 50, executorId: 'user-789', songTitle: 'Track A' });
        const data50 = card50.components[0].toJSON ? card50.components[0].toJSON() : card50.components[0].data;
        const str50 = JSON.stringify(data50);

        assert.match(str50, /當前音量：`\[█████░░░░░\]` \*\*50%\*\*/);
        assert.match(str50, /當前曲目：\*\*Track A\*\*/);
        assert.match(str50, /👤 由 <@user-789> 調整/);
        assert.doesNotMatch(str50, /-#/);
        assert.doesNotMatch(str50, /💡/);

        const actionRow50 = data50.components[4];
        assert.equal(actionRow50.components[1].disabled, true);

        // Test boundary at volume = 100
        const cardMax = buildVolumeCard({ volume: 100 });
        const dataMax = cardMax.components[0].toJSON ? cardMax.components[0].toJSON() : cardMax.components[0].data;
        const actionRowMax = dataMax.components[4];
        assert.equal(actionRowMax.components[2].disabled, true);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false
                }),
                setVolume: () => {
                    throw new Error('Lavalink player communication error');
                }
            },
            settings: {
                set: () => {}
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
            },
            options: {
                getInteger: () => 50
            }
        };

        await volumeCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '調整失敗');
        assert.equal(sentError.desc, '調整音量時發生內部錯誤，請稍後再試。');
    });
});
