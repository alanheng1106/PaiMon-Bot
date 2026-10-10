import {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    ChatInputCommandInteraction
} from 'discord.js';
import { Colors, Emojis, Music as MusicConfig } from '../../config';
import MusicPresenter from '../../core/music/MusicPresenter';
import type BotClient from '../../core/BotClient';
import type MusicManager from '../../core/MusicManager';
import type ServiceContainer from '../../core/ServiceContainer';
import type { Command } from '../../types';

interface PlayCommand extends Command {
    musicManager: MusicManager | null;
}

const command: PlayCommand = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('搜尋並加入網路高音質歌曲')
        .setDMPermission(false)
        .addStringOption((opt) => opt.setName('query').setDescription('曲名或 URL').setRequired(true)),

    category: 'music',
    cooldown: 3,
    helpText:
        '🔹 `/play [曲名或 URL]` - 搜尋並播放歌曲, 支援 YouTube 與 SoundCloud (可輸入 `sc:` 前綴如 `/play query: sc:歌名` 或直接貼連結)',
    musicManager: null,

    configure(container: ServiceContainer) {
        if (container && container.has('music')) {
            this.musicManager = container.get('music');
        }
    },

    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');
        }

        if (!interaction.channel || !interaction.channel.isTextBased()) {
            return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道發送訊息.');
        }
        const textChannel = interaction.channel;

        const me = interaction.guild.members.me;
        if (!me) {
            return await bot.sendError(interaction, '權限不足', '無法取得機器人身分資訊!');
        }

        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions?.has(['Connect', 'Speak'])) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我在這個頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限, 進不去!'
            );
        }

        const botVoiceChannel = me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return await bot.sendError(
                interaction,
                '頻道衝突',
                `我已經在 <#${botVoiceChannel.id}> 裡了, 請到同一個頻道!`
            );
        }

        const query = interaction.options.getString('query', true).trim();
        if (query.length < 2) {
            return await bot.sendError(interaction, '搜尋詞過短', '關鍵字至少要 2 個字!');
        }
        if (query.length > 500) {
            return await bot.sendError(interaction, '搜尋詞過長', '關鍵字不能超過 500 個字!');
        }

        const musicService = this.musicManager || bot?.music;
        if (!musicService) {
            return await bot.sendError(interaction, '服務離線', '音樂服務當前不可用，請稍後再試。');
        }

        await interaction.deferReply();

        try {
            const { isPlaylist, name, tracks, error } = await musicService.search(query);
            if (!tracks?.length) {
                if (error) {
                    return await bot.sendError(interaction, '載入失敗', error);
                }
                return await bot.sendError(interaction, '查無結果', `找不到任何與 \`${query}\` 相符的結果`);
            }

            if (isPlaylist) {
                await musicService.playPlaylist(
                    voiceChannel,
                    textChannel,
                    name || 'Playlist',
                    tracks,
                    interaction.user
                );
                await interaction.deleteReply().catch(() => null);
                return;
            }

            if (/^https?:\/\//i.test(query)) {
                await musicService.play(voiceChannel, textChannel, tracks[0], interaction.user);
                await interaction.deleteReply().catch(() => null);
                return;
            }

            // Interactive Selector (Scheme A with True Headings)
            const results = tracks.slice(0, 5);
            const selectTimeoutSec = Math.round((MusicConfig.SearchSelectTimeoutMs || 25000) / 1000);

            const { container, selectMenu, accentColor } = await MusicPresenter.buildSearchSelectorCard({
                query,
                tracks: results,
                timeoutSec: selectTimeoutSec
            });

            const response = await interaction.editReply({
                components: [container, new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
                flags: MessageFlags.IsComponentsV2 as any
            });

            try {
                const i = await response.awaitMessageComponent({
                    componentType: ComponentType.StringSelect,
                    time: MusicConfig.SearchSelectTimeoutMs || 25000,
                    filter: (comp) => comp.user.id === interaction.user.id
                });

                const selectedIndex = parseInt(i.values[0], 10);
                const selectedTrack = results[selectedIndex];
                if (!selectedTrack) {
                    const errContainer = new ContainerBuilder()
                        .setAccentColor(Colors.Error)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# ${Emojis.Error} 無效的歌曲選擇\n-# 所選曲目不存在或已失效，請重新搜尋。`
                            )
                        );
                    await i.update({ components: [errContainer], flags: MessageFlags.IsComponentsV2 as any });
                    return;
                }

                const selTitle = selectedTrack?.info?.title ? String(selectedTrack.info.title) : '未知曲目';
                const cleanSelTitle = selTitle.length > 50 ? selTitle.slice(0, 47) + '...' : selTitle;
                const text = new TextDisplayBuilder().setContent(
                    `# ⌛ 正在加入播放佇列...\n-# 曲目：**${cleanSelTitle}**`
                );
                const c = new ContainerBuilder().setAccentColor(accentColor).addTextDisplayComponents(text);
                await i.update({ components: [c], flags: MessageFlags.IsComponentsV2 as any });

                try {
                    await musicService.play(voiceChannel, textChannel, selectedTrack, interaction.user);
                    await interaction.deleteReply().catch(() => null);
                } catch (playErr: any) {
                    console.error('[Play CMD] Playback failed:', playErr?.message || playErr);
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(Colors.Error)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# ${Emojis.Error} 歌曲播放失敗\n-# 處理音訊串流時發生錯誤，請稍後再試。`
                            )
                        );
                    await response
                        .edit({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 as any })
                        .catch(() => null);
                }
            } catch {
                // Timeout or cancelled — update the selector message
                const text = new TextDisplayBuilder().setContent(
                    `# ⏰ 選擇已逾時或取消\n-# 超過 ${selectTimeoutSec} 秒未進行選擇，本次搜尋已自動取消。`
                );
                const c = new ContainerBuilder().setAccentColor(Colors.Warning).addTextDisplayComponents(text);

                await response
                    .edit({ components: [c], flags: MessageFlags.IsComponentsV2 as any })
                    .catch((e: any) => console.warn('Ignored error:', e?.message || e));
            }
        } catch (err: any) {
            console.error('[Play CMD]', err?.message || err);
            await bot.sendError(interaction, '播放中斷', '處理時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
