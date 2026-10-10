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
import { Colors } from '../../config';
import MusicPresenter from '../../core/music/MusicPresenter';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder().setName('resume').setDescription('恢復播放暫停的歌曲').setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/resume` - 繼續播放暫停中的歌曲',
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
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能恢復播放!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以恢復');
        }

        if (!queue.player?.paused) {
            return await bot.sendError(interaction, '操作無效', '當前歌曲並未處於暫停狀態!');
        }

        try {
            bot.music.resume(interaction.guild.id);

            const currentSong = queue.currentSong ?? (queue.songs && queue.songs.length > 0 ? queue.songs[0] : null);
            const positionMs = queue.player?.position ?? 0;
            const posStr = typeof MusicPresenter?.formatTime === 'function' ? MusicPresenter.formatTime(positionMs) : '00:00';
            const durStr =
                currentSong?.duration && typeof MusicPresenter?.formatDuration === 'function'
                    ? MusicPresenter.formatDuration(currentSong.duration)
                    : '--:--';

            // 行動端視覺協調：與 nowplaying 和 pause 保持一致的標題層級與截斷長度
            const rawTitle = currentSong?.title || '當前曲目';
            const cleanTitle = rawTitle.length > 45 ? rawTitle.slice(0, 42) + '...' : rawTitle;
            const cleanAuthor = currentSong?.author || '未知歌手';
            const titleMd = currentSong?.url ? `## [${cleanTitle}](${currentSong.url})` : `## ${cleanTitle}`;

            const container = new ContainerBuilder()
                .setAccentColor(Colors.Success) // 活力綠 (Vibrant Green) 代表恢復正常播放狀態
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ▶️ 播放已恢復'))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const trackContent = `${titleMd}\n🎤 **${cleanAuthor}**\n⏱️ 當前進度：\`${posStr} / ${durStr}\``;

            // 若有封面則使用 Section 搭配 80x80 Thumbnail Accessory，若無封面則優雅降級為文字組件
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

            // 交互式播控按鈕：一鍵再次暫停或跳過歌曲
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('music:toggle_pause')
                    .setLabel('暫停播放')
                    .setEmoji('⏸️')
                    .setStyle(ButtonStyle.Secondary),
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
            console.error('[Resume CMD]', err);
            if (typeof bot?.sendError === 'function') {
                await bot.sendError(interaction, '恢復失敗', '恢復歌曲時發生內部錯誤，請稍後再試。');
            }
        }
    }
};

export default command;
