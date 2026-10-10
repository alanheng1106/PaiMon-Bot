import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const loopCommand = require('../src/commands/music/loop').default || require('../src/commands/music/loop');

describe('Loop Music Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(loopCommand.data.name, 'loop');
        assert.equal(loopCommand.data.dm_permission, false);
        assert.equal(loopCommand.category, 'music');
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

        await loopCommand.execute(mockInteraction, mockBot);
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

        await loopCommand.execute(mockInteraction, mockBot);
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

        await loopCommand.execute(mockInteraction, mockBot);
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
            guild: { members: { me: { voice: { channel: { id: 'vc-bot' } } } } }
        };

        await loopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '不在同一頻道');
    });

    it('rejects execution when queue does not exist', async () => {
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
            member: { voice: { channel: { id: 'vc-same' } } },
            guild: {
                id: 'guild-123',
                members: { me: { voice: { channel: { id: 'vc-same' } } } }
            }
        };

        await loopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('rejects execution when queue exists but is empty (e.g. after join without songs)', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => true,
                    loopMode: 'none'
                })
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

        await loopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '佇列為空');
    });

    it('cycles loop modes cleanly: none -> track -> queue -> none', async () => {
        let currentMode = 'none';
        const mockQueue = {
            isEmpty: () => false,
            get loopMode() {
                return currentMode;
            },
            setLoopMode: (m) => {
                currentMode = m;
            }
        };

        let repliedOptions = null;
        const mockInteraction = {
            inCachedGuild: () => true,
            member: { voice: { channel: { id: 'vc-same' } } },
            guild: {
                id: 'guild-123',
                members: { me: { voice: { channel: { id: 'vc-same' } } } }
            },
            reply: async (opts) => {
                repliedOptions = opts;
            }
        };

        const mockBot = {
            music: {
                getQueue: () => mockQueue
            }
        };

        // none -> track
        await loopCommand.execute(mockInteraction, mockBot);
        assert.equal(currentMode, 'track');
        assert.ok(repliedOptions);

        // track -> queue
        await loopCommand.execute(mockInteraction, mockBot);
        assert.equal(currentMode, 'queue');

        // queue -> none
        await loopCommand.execute(mockInteraction, mockBot);
        assert.equal(currentMode, 'none');
    });

    it('catches and reports unexpected exceptions cleanly', async () => {
        let sentError = null;
        const mockBot = {
            music: {
                getQueue: () => ({
                    isEmpty: () => false,
                    loopMode: 'none',
                    setLoopMode: () => {
                        throw new Error('Unexpected Queue Error');
                    }
                })
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

        await loopCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '切換失敗');
    });

    describe('Scheme 3 CV2 Interactive Dashboard & Heading 1', () => {
        const { buildLoopCard } = require('../src/commands/music/loop');

        it('buildLoopCard formats with Heading 1 and proper CV2 structure', () => {
            const card = buildLoopCard({
                currentMode: 'track',
                songTitle: 'Test Song Title',
                queueLength: 5,
                voiceChannelId: 'vc-101',
                executorId: 'user-777'
            });

            assert.ok(card);
            assert.equal(card.components.length, 1);

            const containerData = card.components[0].toJSON ? card.components[0].toJSON() : card.components[0];
            const jsonStr = JSON.stringify(containerData);

            // 1. Heading 1 Verification
            assert.match(jsonStr, /# 🎛️ 音樂循環控制台/);

            // 2. Track info & channel verification
            assert.match(jsonStr, /Test Song Title/);
            assert.match(jsonStr, /5/);
            assert.match(jsonStr, /vc-101/);
            assert.match(jsonStr, /user-777/);

            // 3. Subtext verification (-#)
            assert.match(jsonStr, /-# 💡 點擊上方按鈕可即時切換播放模式/);

            // 4. Accent Color for 'track' (0xfee75c = 16705372)
            assert.equal(containerData.accent_color, 0xfee75c);
        });

        it('buildLoopCard accurately toggles button disabled states and styles based on active mode', () => {
            const testModes = ['none', 'track', 'queue'];
            const expectedColors = {
                none: 0x4e5058,
                track: 0xfee75c,
                queue: 0x57f287
            };

            for (const mode of testModes) {
                const card = buildLoopCard({
                    currentMode: mode,
                    queueLength: 1,
                    voiceChannelId: 'vc-1'
                });

                const containerData = card.components[0].toJSON ? card.components[0].toJSON() : card.components[0];
                assert.equal(containerData.accent_color, expectedColors[mode]);

                // Find ActionRow
                const actionRow = containerData.components.find((c) => c.type === 1);
                assert.ok(actionRow, 'ActionRow must exist');
                assert.equal(actionRow.components.length, 3);

                const noneBtn = actionRow.components.find((b) => b.custom_id === 'music:loop:none');
                const trackBtn = actionRow.components.find((b) => b.custom_id === 'music:loop:track');
                const queueBtn = actionRow.components.find((b) => b.custom_id === 'music:loop:queue');

                assert.ok(noneBtn && trackBtn && queueBtn);

                // The active mode button must be disabled, and others must be enabled
                assert.equal(noneBtn.disabled, mode === 'none');
                assert.equal(trackBtn.disabled, mode === 'track');
                assert.equal(queueBtn.disabled, mode === 'queue');

                // Active button style is Success (3), others are Secondary (2)
                const activeBtn = mode === 'none' ? noneBtn : mode === 'track' ? trackBtn : queueBtn;
                assert.equal(activeBtn.style, 3); // ButtonStyle.Success
            }
        });
    });
});
