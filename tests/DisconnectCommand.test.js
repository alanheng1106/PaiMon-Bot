import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const disconnectCommand =
    require('../src/commands/music/disconnect').default || require('../src/commands/music/disconnect');

describe('Disconnect Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(disconnectCommand.data.name, 'disconnect');
        assert.equal(disconnectCommand.data.dm_permission, false);
        assert.equal(disconnectCommand.category, 'music');
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

        await disconnectCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
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

        await disconnectCommand.execute(mockInteraction, mockBot);
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
            member: { voice: { channel: { id: 'vc-user' } } },
            guild: { members: { me: { voice: { channel: { id: 'vc-bot' } } } } }
        };

        await disconnectCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('successfully disconnects and sends success feedback via fallback when reply not provided', async () => {
        let leaveGuildId = null;
        let sentSuccess = null;
        const mockBot = {
            music: {
                leave: (guildId) => {
                    leaveGuildId = guildId;
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-same' } } },
            guild: {
                id: 'guild-123',
                members: { me: { voice: { channel: { id: 'vc-same' } } } }
            }
        };

        await disconnectCommand.execute(mockInteraction, mockBot);
        assert.equal(leaveGuildId, 'guild-123');
        assert.ok(sentSuccess);
        assert.match(sentSuccess.title, /斷開連線/);
    });

    it('successfully delivers Scheme C CV2 container via interaction.reply', async () => {
        let leaveGuildId = null;
        let repliedPayload = null;
        const mockBot = {
            music: {
                leave: (guildId) => {
                    leaveGuildId = guildId;
                }
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'user-456' },
            member: { voice: { channel: { id: 'vc-music-101' } } },
            guild: {
                id: 'guild-123',
                members: { me: { voice: { channel: { id: 'vc-music-101' } } } }
            },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await disconnectCommand.execute(mockInteraction, mockBot);
        assert.equal(leaveGuildId, 'guild-123');
        assert.ok(repliedPayload);
        assert.equal(repliedPayload.components.length, 1);

        const containerData = repliedPayload.components[0].toJSON
            ? repliedPayload.components[0].toJSON()
            : repliedPayload.components[0];
        const jsonStr = JSON.stringify(containerData);
        assert.match(jsonStr, /語音連線已中斷/);
        assert.match(jsonStr, /vc-music-101/);
        assert.match(jsonStr, /music:rejoin:vc-music-101/);
        assert.match(jsonStr, /重新召回/);
        assert.match(jsonStr, /user-456/);
    });

    it('buildDisconnectCard constructs proper Scheme C recovery card with rejoin button', () => {
        const { buildDisconnectCard } = require('../src/commands/music/disconnect');
        const { MessageFlags } = require('discord.js');
        const { Colors } = require('../src/config');

        const card = buildDisconnectCard({
            voiceChannelId: 'channel-999',
            executorId: 'user-777'
        });

        assert.equal(card.flags, MessageFlags.IsComponentsV2);
        assert.equal(card.components.length, 1);

        const container = card.components[0].toJSON ? card.components[0].toJSON() : card.components[0];
        assert.equal(container.accent_color, Colors.Warning);

        const jsonStr = JSON.stringify(container);
        assert.match(jsonStr, /# 🔇 語音連線已中斷/);
        assert.match(jsonStr, /<#channel-999>/);
        assert.match(jsonStr, /music:rejoin:channel-999/);
        assert.match(jsonStr, /重新召回/);
        assert.match(jsonStr, /<@user-777>/);
        assert.match(jsonStr, /已退出/);
    });

    it('catches and reports unexpected errors cleanly', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                leave: () => {
                    throw new Error('Shoukaku connection error');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-same' } } },
            guild: {
                id: 'guild-123',
                members: { me: { voice: { channel: { id: 'vc-same' } } } }
            }
        };

        await disconnectCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '斷開失敗');
    });
});
