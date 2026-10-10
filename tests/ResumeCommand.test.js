import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const resumeCommand = require('../src/commands/music/resume').default || require('../src/commands/music/resume');

describe('Resume Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(resumeCommand.data.name, 'resume');
        assert.equal(resumeCommand.data.dm_permission, false);
        assert.equal(resumeCommand.category, 'music');
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

        await resumeCommand.execute(mockInteraction, mockBot);
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

        await resumeCommand.execute(mockInteraction, mockBot);
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

        await resumeCommand.execute(mockInteraction, mockBot);
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

        await resumeCommand.execute(mockInteraction, mockBot);
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

        await resumeCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects execution when player is not paused', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            },
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
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

        await resumeCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /並未處於暫停狀態/);
    });

    it('resumes playback and replies successfully when active and paused', async () => {
        let resumedGuildId = null;
        let repliedOpts = null;

        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: true }
                }),
                resume: (guildId) => {
                    resumedGuildId = guildId;
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

        await resumeCommand.execute(mockInteraction, mockBot);

        assert.equal(resumedGuildId, 'guild-1');
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    player: { paused: true }
                }),
                resume: () => {
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

        await resumeCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '恢復失敗');
    });
});
