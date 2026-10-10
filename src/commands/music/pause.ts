import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ChatInputCommandInteraction
} from 'discord.js';
import MusicPresenter from '../../core/music/MusicPresenter';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder().setName('pause').setDescription('暫停當前正在播放的歌曲').setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/pause` - 暫停目前播放的歌曲',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');
        }

        const botVoiceChannel = interaction.guild.members.me?.voice.channel;
        if (!botVoiceChannel) {
            return await bot.sendError(interaction, '操作無效', '我目前不在任何語音頻道!');
        }

        if (botVoiceChannel.id !== voiceChannel.id) {
            return await bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能暫停歌曲!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以暫停');
        }

        if (queue.player?.paused) {
            return await bot.sendError(interaction, '操作無效', '當前歌曲已經處於暫停狀態!');
        }

        try {
            bot.music.pause(interaction.guild.id);

            const currentSong = queue.currentSong ?? (queue.songs && queue.songs.length > 0 ? queue.songs[0] : null);
            const positionMs = queue.player?.position ?? 0;
            const posStr = MusicPresenter.formatTime(positionMs);
            const durStr = currentSong?.duration ? MusicPresenter.formatDuration(currentSong.duration) : '--:--';

            // 行動端視覺協調：與 nowplaying 保持一致的標題層級與截斷長度
            const rawTitle = currentSong?.title || '當前曲目';
            const cleanTitle = rawTitle.length > 45 ? rawTitle.slice(0, 42) + '...' : rawTitle;
            const cleanAuthor = currentSong?.author || '未知歌手';
            const titleMd = currentSong?.url ? `## [${cleanTitle}](${currentSong.url})` : `## ${cleanTitle}`;

            const container = new ContainerBuilder()
                .setAccentColor(0xfee75c) // 琥珀金 (Amber Yellow) 保持播放器掛起/暫停狀態語意統一
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⏸️ 播放已暫停'))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const trackContent = `${titleMd}\n🎤 **${cleanAuthor}**\n⏱️ 定格進度：\`${posStr} / ${durStr}\``;

            // 若有封面則使用 Section 配搭 80x80 Thumbnail Accessory，若無封面則優雅降級為文字組件
            if (currentSong?.thumbnail) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(trackContent))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentSong.thumbnail))
                );
            } else {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(trackContent));
            }

            const userId = interaction.user?.id || (interaction.member as any)?.id;
            const userTag = userId ? `<@${userId}>` : '未知操作者';
            const channelTag = voiceChannel?.id ? `<#${voiceChannel.id}>` : '語音頻道';

            // 次要資訊（操作者與語音頻道）置於分割線上方，與內容區自然成組
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 👤 操作者：${userTag} • 🔊 頻道：${channelTag}`)
            );

            // 交互式播控按鈕：一鍵繼續播放與跳過歌曲
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('music:toggle_pause')
                    .setLabel('繼續播放')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('music:skip')
                    .setLabel('跳過此曲')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
            );

            // 邏輯分割線：將上方數據資訊區與下方播控按鈕區俐落切分
            container
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(actionRow);

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 as any });
        } catch (err: any) {
            console.error('[Pause CMD]', err);
            if (typeof bot?.sendError === 'function') {
                await bot.sendError(interaction, '暫停失敗', '暫停歌曲時發生內部錯誤，請稍後再試。');
            }
        }
    }
};

export default command;
