import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const skipCommand = require('../src/commands/music/skip').default || require('../src/commands/music/skip');

describe('Skip Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(skipCommand.data.name, 'skip');
        assert.equal(skipCommand.data.dm_permission, false);
        assert.equal(skipCommand.category, 'music');
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

        await skipCommand.execute(mockInteraction, mockBot);
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

        await skipCommand.execute(mockInteraction, mockBot);
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

        await skipCommand.execute(mockInteraction, mockBot);
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

        await skipCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('rejects execution when queue is null or empty', async () => {
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

        await skipCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');

        // Test queue.isEmpty() === true
        sentError = null;
        mockBot.music.getQueue = () => ({
            isEmpty: () => true
        });

        await skipCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('skips playback and replies successfully when active', async () => {
        let skippedGuildId = null;
        let successResponse = null;

        const mockQueue = {
            isEmpty: () => false,
            loopMode: 'none',
            setLoopMode: () => {}
        };

        const mockBot = {
            music: {
                getQueue: () => mockQueue,
                skip: (guildId) => {
                    skippedGuildId = guildId;
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                successResponse = { title, desc };
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

        await skipCommand.execute(mockInteraction, mockBot);

        assert.equal(skippedGuildId, 'guild-1');
        assert.ok(successResponse);
        assert.equal(successResponse.title, '⏭️ 跳過歌曲');
    });

    it('resets loopMode when current loopMode is track before skipping', async () => {
        let changedMode = null;
        let skipped = false;

        const mockQueue = {
            isEmpty: () => false,
            loopMode: 'track',
            setLoopMode: (mode) => {
                changedMode = mode;
                mockQueue.loopMode = mode;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => mockQueue,
                skip: () => {
                    skipped = true;
                }
            },
            sendSuccess: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            }
        };

        await skipCommand.execute(mockInteraction, mockBot);

        assert.equal(changedMode, 'none');
        assert.equal(skipped, true);
    });

    it('catches and reports unexpected exceptions', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    loopMode: 'none'
                }),
                skip: () => {
                    throw new Error('Shoukaku Node offline');
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

        await skipCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '跳過失敗');
    });

    it('renders Scheme 3 interactive controller card with true Heading 1 (#) and buttons', async () => {
        let repliedOpts = null;
        let skippedGuildId = null;

        const mockQueue = {
            isEmpty: () => false,
            loopMode: 'none',
            currentSong: {
                title: 'Racing into the Night',
                author: 'YOASOBI',
                duration: 261000,
                thumbnail: 'https://example.com/thumb.jpg',
                url: 'https://youtube.com/watch?v=test'
            },
            songs: [
                {
                    title: 'Racing into the Night',
                    author: 'YOASOBI',
                    duration: 261000,
                    thumbnail: 'https://example.com/thumb.jpg',
                    url: 'https://youtube.com/watch?v=test'
                },
                {
                    title: 'Gunjou',
                    author: 'YOASOBI',
                    duration: 248000,
                    url: 'https://youtube.com/watch?v=next'
                }
            ],
            setLoopMode: () => {}
        };

        const mockBot = {
            music: {
                getQueue: () => mockQueue,
                skip: (guildId) => {
                    skippedGuildId = guildId;
                }
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'user-456' },
            member: { voice: { channel: { id: 'vc-1' } } },
            guild: {
                id: 'guild-1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            reply: async (opts) => {
                repliedOpts = opts;
            }
        };

        await skipCommand.execute(mockInteraction, mockBot);

        assert.equal(skippedGuildId, 'guild-1');
        assert.ok(repliedOpts);
        assert.ok(repliedOpts.components && repliedOpts.components.length > 0);

        const containerData = repliedOpts.components[0].toJSON
            ? repliedOpts.components[0].toJSON()
            : repliedOpts.components[0].data;

        // Verify Accent Color is Music Purple (0x9b59b6)
        assert.equal(containerData.accent_color, 0x9b59b6);

        const jsonStr = JSON.stringify(containerData);

        // 1. True Level 1 Heading verification (#)
        assert.match(jsonStr, /# ⏭️ 曲目已跳過/);

        // 2. Section Heading 2 & metadata verification
        assert.match(jsonStr, /## \[Racing into the Night\]/);
        assert.match(jsonStr, /YOASOBI/);
        assert.match(jsonStr, /https:\/\/example\.com\/thumb\.jpg/);

        // 3. Next song context & Heading 3 verification
        assert.match(jsonStr, /### 🎶 即將播放：\[Gunjou\]/);
        assert.match(jsonStr, /佇列剩餘 \*\*1\*\* 首歌曲/);

        // 4. ActionRow buttons verification
        assert.match(jsonStr, /music:skip/);
        assert.match(jsonStr, /music:queue/);
        assert.match(jsonStr, /music:open_play_modal/);

        // 5. Subtext verification
        assert.match(jsonStr, /-# 👤 由 <@user-456> 操作/);
        // Verify lightbulb tip removed
        assert.doesNotMatch(jsonStr, /💡/);
    });
});
