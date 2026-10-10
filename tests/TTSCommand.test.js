import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ttsCommand = require('../src/commands/general/tts').default || require('../src/commands/general/tts');

describe('TTS General Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(ttsCommand.data.name, 'tts');
        assert.equal(ttsCommand.data.dm_permission, false);
        assert.equal(ttsCommand.category, 'general');
        assert.equal(ttsCommand.cooldown, 5);

        const textOpt = ttsCommand.data.options.find((o) => o.name === 'text');
        assert.ok(textOpt);
        assert.equal(textOpt.required, true);

        const langOpt = ttsCommand.data.options.find((o) => o.name === 'lang');
        assert.ok(langOpt);
        assert.equal(langOpt.required, false);
        assert.equal(langOpt.choices.length, 7);
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

        await ttsCommand.execute(mockInteraction, mockBot);
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
            deferReply: async () => {},
            member: { voice: { channel: null } }
        };

        await ttsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '語音錯誤');
    });

    it('rejects execution when text is whitespace only', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockVoiceChannel = {
            id: 'vc-1',
            permissionsFor: () => ({
                has: () => true
            })
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            deferReply: async () => {},
            member: {
                voice: { channel: mockVoiceChannel }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            },
            options: {
                getString: (name) => (name === 'text' ? '   ' : null)
            }
        };

        await ttsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '內容無效');
    });

    it('rejects execution when text exceeds 200 characters', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockVoiceChannel = {
            id: 'vc-1',
            permissionsFor: () => ({
                has: () => true
            })
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            deferReply: async () => {},
            member: {
                voice: { channel: mockVoiceChannel }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            },
            options: {
                getString: (name) => (name === 'text' ? 'a'.repeat(201) : null)
            }
        };

        await ttsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '字數過長');
    });

    it('executes successfully with valid text and voice channel', async () => {
        let playCalledWith = null;
        let sentSuccess = null;

        const mockBot = {
            music: {
                search: async () => ({
                    tracks: [{ info: { title: '', author: '' }, encoded: 'dummy' }]
                }),
                play: async (vc, tc, track, user, options) => {
                    playCalledWith = { vc, tc, track, user, options };
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            },
            sendError: async () => {}
        };

        const mockVoiceChannel = {
            id: 'vc-1',
            permissionsFor: () => ({
                has: () => true
            })
        };
        const mockTextChannel = {
            id: 'tc-1',
            isTextBased: () => true
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            deferReply: async () => {},
            user: { id: 'u-1', username: 'tester' },
            channel: mockTextChannel,
            member: {
                voice: { channel: mockVoiceChannel }
            },
            guild: {
                members: {
                    me: { voice: { channel: null } }
                }
            },
            options: {
                getString: (name) => (name === 'text' ? '測試語音' : 'zh-TW')
            }
        };

        await ttsCommand.execute(mockInteraction, mockBot);
        assert.ok(playCalledWith);
        assert.equal(playCalledWith.options.isTTS, true);
        assert.equal(playCalledWith.track.info.title, 'TTS: 測試語音');
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '🗣️ 文字轉語音');
    });

    describe('Scheme C CV2 Broadcast Card & Replay Cache', () => {
        const {
            buildTTSBroadcastCard,
            storeTTSReplay,
            getTTSReplay,
            ttsReplayCache
        } = require('../src/commands/general/tts');
        const { Colors } = require('../src/config');
        const { MessageFlags } = require('discord.js');

        it('stores and retrieves TTS replay utterances with TTL', () => {
            const replayId = storeTTSReplay('早安大家！', 'zh-TW', 'user-42', 'guild-1');
            assert.ok(replayId);
            assert.equal(typeof replayId, 'string');

            const cached = getTTSReplay(replayId);
            assert.ok(cached);
            assert.equal(cached.text, '早安大家！');
            assert.equal(cached.lang, 'zh-TW');
            assert.equal(cached.userId, 'user-42');
            assert.equal(cached.guildId, 'guild-1');

            // Expired key handling
            ttsReplayCache.set('old-id', {
                text: '過期文字',
                lang: 'en',
                userId: 'user-1',
                createdAt: Date.now() - 20 * 60 * 1000
            });
            assert.equal(getTTSReplay('old-id'), undefined);
            assert.equal(getTTSReplay('non-existent-id'), undefined);
        });

        it('buildTTSBroadcastCard constructs complete Scheme C Studio Console container', () => {
            const payload = buildTTSBroadcastCard({
                text: '今天晚上的團練準時八點開始！',
                lang: 'zh-TW',
                user: { id: 'u-123', username: 'TestUser' },
                voiceChannel: { id: 'vc-789', name: '一般語音' },
                replayId: 'rep-abc'
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const containerJson = payload.components[0].toJSON();
            assert.equal(containerJson.accent_color, Colors.Music); // 0x5865f2

            const jsonStr = JSON.stringify(containerJson);
            // 1. Heading 1 Anchor
            assert.match(jsonStr, /# 🎙️ TTS 語音廣播回執/);
            // 2. Target Voice Channel & Broadcaster
            assert.match(jsonStr, /<#vc-789>/);
            assert.match(jsonStr, /<@u-123>/);
            assert.match(jsonStr, /繁體中文/);
            assert.match(jsonStr, /🟢 播放中/);
            // 3. Spoken text block
            assert.match(jsonStr, /今天晚上的團練準時八點開始！/);
            // 4. Action buttons
            assert.match(jsonStr, /tts:replay:rep-abc/);
            assert.match(jsonStr, /tts:stop/);
            // 5. Footer subtext
            assert.match(jsonStr, /-# 💡 管理員可使用 \/ttschannel 設定自動朗讀頻道/);
        });

        it('buildTTSBroadcastCard safely escapes triple backticks in spoken text', () => {
            const payload = buildTTSBroadcastCard({
                text: '測試代碼塊 ```code``` 防禦',
                lang: 'en',
                user: { id: 'u-1' },
                voiceChannel: { id: 'vc-1' }
            });

            const jsonStr = JSON.stringify(payload.components[0].toJSON());
            assert.ok(!jsonStr.includes('```code```'));
            assert.match(jsonStr, /測試代碼塊/);
        });

        it('delivers Scheme C card via interaction.editReply when available', async () => {
            let editedPayload = null;
            let playCalledWith = null;

            const mockBot = {
                music: {
                    search: async () => ({
                        tracks: [{ info: { title: '', author: '' }, encoded: 'dummy' }]
                    }),
                    play: async (vc, tc, track, user, options) => {
                        playCalledWith = { vc, tc, track, user, options };
                    }
                },
                sendSuccess: async () => {
                    assert.fail('Should not call sendSuccess when editReply is available');
                },
                sendError: async () => {}
            };

            const mockVoiceChannel = {
                id: 'vc-999',
                permissionsFor: () => ({ has: () => true })
            };
            const mockTextChannel = {
                id: 'tc-999',
                isTextBased: () => true
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                deferred: true,
                deferReply: async () => {},
                editReply: async (payload) => {
                    editedPayload = payload;
                },
                user: { id: 'u-admin', username: 'Broadcaster' },
                channel: mockTextChannel,
                member: {
                    voice: { channel: mockVoiceChannel }
                },
                guild: {
                    id: 'guild-cv2',
                    members: {
                        me: { voice: { channel: null } }
                    }
                },
                options: {
                    getString: (name) => (name === 'text' ? '全域廣播測試' : 'ja')
                }
            };

            await ttsCommand.execute(mockInteraction, mockBot);

            assert.ok(playCalledWith);
            assert.ok(editedPayload);
            assert.equal(editedPayload.flags, MessageFlags.IsComponentsV2);
            const containerJson = editedPayload.components[0].toJSON();
            assert.equal(containerJson.accent_color, Colors.Music);
            assert.match(JSON.stringify(containerJson), /全域廣播測試/);
            assert.match(JSON.stringify(containerJson), /<#vc-999>/);
            assert.match(JSON.stringify(containerJson), /日文/);
        });
    });
});
