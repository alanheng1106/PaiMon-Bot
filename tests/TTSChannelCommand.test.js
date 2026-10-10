import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits, ChannelType } = require('discord.js');

const ttsChannelCommand =
    require('../src/commands/admin/ttschannel').default || require('../src/commands/admin/ttschannel');

describe('TTSChannel Admin Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(ttsChannelCommand.data.name, 'ttschannel');
        assert.equal(ttsChannelCommand.data.dm_permission, false);
        assert.equal(ttsChannelCommand.data.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
        assert.equal(ttsChannelCommand.category, 'admin');
        assert.equal(ttsChannelCommand.cooldown, 3);

        const subcommands = ttsChannelCommand.data.options;
        const setSub = subcommands.find((s) => s.name === 'set');
        const removeSub = subcommands.find((s) => s.name === 'remove');
        assert.ok(setSub);
        assert.ok(removeSub);

        const channelOpt = setSub.options.find((o) => o.name === 'channel');
        assert.ok(channelOpt);
        assert.equal(channelOpt.required, true);
        assert.deepEqual(channelOpt.channel_types, [ChannelType.GuildText]);

        const langOpt = setSub.options.find((o) => o.name === 'lang');
        assert.ok(langOpt);
        assert.equal(langOpt.required, false);
        assert.equal(langOpt.choices.length, 4);
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

        await ttsChannelCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('successfully binds a channel with explicit language', async () => {
        let savedSettings = null;
        let sentSuccess = null;

        const mockBot = {
            settings: {
                get: () => null,
                set: (guildId, key, value) => {
                    savedSettings = { guildId, key, value };
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'set',
                getChannel: () => ({ id: 'ch-999' }),
                getString: (name) => (name === 'lang' ? 'ja' : null)
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);

        assert.ok(savedSettings);
        assert.equal(savedSettings.guildId, 'guild-123');
        assert.equal(savedSettings.key, 'tts');
        assert.deepEqual(savedSettings.value, { channelId: 'ch-999', lang: 'ja' });

        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '自動 TTS 頻道已設定');
        assert.match(sentSuccess.desc, /<#ch-999>/);
        assert.match(sentSuccess.desc, /ja/);
    });

    it('defaults to zh-TW when no language is provided on a clean guild', async () => {
        let savedSettings = null;
        let sentSuccess = null;

        const mockBot = {
            settings: {
                get: () => null,
                set: (guildId, key, value) => {
                    savedSettings = { guildId, key, value };
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'set',
                getChannel: () => ({ id: 'ch-999' }),
                getString: () => null
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);

        assert.equal(savedSettings.value.lang, 'zh-TW');
        assert.match(sentSuccess.desc, /zh-TW/);
    });

    it('inherits existing language when setting a new channel without specifying lang', async () => {
        let savedSettings = null;

        const mockBot = {
            settings: {
                get: (guildId, key) => (key === 'tts' ? { channelId: 'ch-old', lang: 'en' } : null),
                set: (guildId, key, value) => {
                    savedSettings = { guildId, key, value };
                }
            },
            sendSuccess: async () => {}
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'set',
                getChannel: () => ({ id: 'ch-new' }),
                getString: () => null
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);

        assert.equal(savedSettings.value.channelId, 'ch-new');
        assert.equal(savedSettings.value.lang, 'en');
    });

    it('rejects remove when no TTS channel was previously configured', async () => {
        let sentError = null;

        const mockBot = {
            settings: {
                get: () => null
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'remove'
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);

        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
        assert.match(sentError.desc, /尚未綁定/);
    });

    it('successfully unbinds TTS channel when configured', async () => {
        let savedSettings = null;
        let sentSuccess = null;

        const mockBot = {
            settings: {
                get: () => ({ channelId: 'ch-123', lang: 'zh-TW' }),
                set: (guildId, key, value) => {
                    savedSettings = { guildId, key, value };
                }
            },
            sendSuccess: async (interaction, title, desc) => {
                sentSuccess = { title, desc };
            }
        };

        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'remove'
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);

        assert.ok(savedSettings);
        assert.equal(savedSettings.value, null);
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '自動 TTS 頻道已解除');
    });

    it('handles unknown subcommand gracefully', async () => {
        let sentError = null;
        const mockBot = {
            settings: { get: () => null },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'unknown'
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '操作無效');
    });

    it('catches and reports unexpected errors cleanly', async () => {
        let sentError = null;
        const mockBot = {
            settings: {
                get: () => {
                    throw new Error('Database disk error');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            guild: { id: 'guild-123' },
            options: {
                getSubcommand: () => 'remove'
            }
        };

        await ttsChannelCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /請稍後再試/);
    });

    describe('Scheme B CV2 Card Builders & Execution (Sleek Full-Width)', () => {
        const { buildTTSConsoleCard, buildTTSReleaseCard } = require('../src/commands/admin/ttschannel');
        const { MessageFlags } = require('discord.js');
        const { Colors } = require('../src/config');

        it('buildTTSConsoleCard constructs a clean, full-width container without thumbnail clutter', () => {
            const payload = buildTTSConsoleCard({
                channel: { id: 'ch-888', name: 'chat-voice' },
                lang: 'zh-TW',
                executor: { id: 'u-111', username: 'Moderator' }
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, Colors.Success);

            const jsonStr = JSON.stringify(container);
            assert.match(jsonStr, /# 🎙️ 自動 TTS 頻道已設定/);
            assert.match(jsonStr, /<#ch-888>/);
            assert.match(jsonStr, /🇹🇼 繁體中文/);
            assert.match(jsonStr, /🟢 待命中/);
            // Verify no ugly default avatar or thumbnail accessory
            assert.doesNotMatch(jsonStr, /avatars\/0\.png/);
            assert.doesNotMatch(jsonStr, /thumbnail/i);
            // Verify buttons
            assert.match(jsonStr, /tts:test:ch-888/);
            assert.match(jsonStr, /測試發音/);
            assert.match(jsonStr, /tts:unbind:ch-888/);
            assert.match(jsonStr, /解除綁定/);
            // Verify clean subtext without emoji noise
            assert.match(jsonStr, /設定者：<@u-111>/);
            assert.doesNotMatch(jsonStr, /👮/);
            assert.doesNotMatch(jsonStr, /💡/);
        });

        it('buildTTSReleaseCard constructs a sleek slate-grey container with clear dark-mode contrast', () => {
            const payload = buildTTSReleaseCard({
                channelId: 'ch-888',
                executor: { id: 'u-111' }
            });

            assert.equal(payload.flags, MessageFlags.IsComponentsV2);
            const container = payload.components[0].toJSON();
            assert.equal(container.accent_color, 0x95a5a6);

            const jsonStr = JSON.stringify(container);
            assert.match(jsonStr, /# 🔌 自動 TTS 頻道已解除/);
            assert.match(jsonStr, /<#ch-888>/);
            assert.match(jsonStr, /⚪ 已停用/);
            assert.match(jsonStr, /執行者：<@u-111>/);
            assert.doesNotMatch(jsonStr, /avatars\/0\.png/);
            assert.doesNotMatch(jsonStr, /thumbnail/i);
            assert.doesNotMatch(jsonStr, /👮/);
        });

        it('delivers sleek console card directly via interaction.reply on set', async () => {
            let repliedPayload = null;
            const mockBot = {
                settings: {
                    get: () => null,
                    set: () => {}
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                user: { id: 'admin-99' },
                options: {
                    getSubcommand: () => 'set',
                    getChannel: () => ({ id: 'ch-555', name: 'general' }),
                    getString: () => 'en'
                },
                reply: async (payload) => {
                    repliedPayload = payload;
                }
            };

            await ttsChannelCommand.execute(mockInteraction, mockBot);
            assert.ok(repliedPayload);
            assert.equal(repliedPayload.flags, MessageFlags.IsComponentsV2);

            const container = repliedPayload.components[0].toJSON();
            assert.equal(container.accent_color, Colors.Success);
            assert.match(JSON.stringify(container), /🇺🇸 英文/);
            assert.match(JSON.stringify(container), /tts:test:ch-555/);
        });

        it('delivers sleek release card directly via interaction.reply on remove', async () => {
            let repliedPayload = null;
            const mockBot = {
                settings: {
                    get: () => ({ channelId: 'ch-555', lang: 'zh-TW' }),
                    set: () => {}
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                guild: { id: 'guild-123' },
                user: { id: 'admin-99' },
                options: {
                    getSubcommand: () => 'remove'
                },
                reply: async (payload) => {
                    repliedPayload = payload;
                }
            };

            await ttsChannelCommand.execute(mockInteraction, mockBot);
            assert.ok(repliedPayload);
            assert.equal(repliedPayload.flags, MessageFlags.IsComponentsV2);

            const container = repliedPayload.components[0].toJSON();
            assert.equal(container.accent_color, 0x95a5a6);
            assert.match(JSON.stringify(container), /頻道已解除/);
        });
    });
});
