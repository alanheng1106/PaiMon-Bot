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

export interface SkipCardParams {
    song?: {
        title: string;
        author?: string;
        duration?: number;
        thumbnail?: string;
        url?: string;
    } | null;
    voiceChannelId?: string;
    executorId?: string;
    nextSong?: {
        title: string;
        author?: string;
        duration?: number;
        url?: string;
    } | null;
    remainingCount?: number;
    accentColor?: number;
}

/**
 * Builds the interactive Scheme 3 Music Skip Controller Card using Discord CV2 components.
 * Formatted with true Level 1 Heading (#), Section thumbnail pairing, queue context, and quick-action buttons.
 */
export function buildSkipCard(params: SkipCardParams) {
    const {
        song,
        voiceChannelId,
        executorId,
        nextSong,
        remainingCount = 0,
        accentColor = 0x9b59b6 // 律動紫 (Music Purple) 代表多媒體決策與狀態變遷
    } = params;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. 真正的 Heading 1 大標題（24px 粗體，頂層核心視覺錨點）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⏭️ 曲目已跳過'))
        // 2. 緊湊分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // 3. 被跳過曲目核心內容區（Section + 80x80 Thumbnail）
    const rawTitle = song?.title || '當前曲目';
    const cleanTitle = rawTitle.length > 45 ? rawTitle.slice(0, 42) + '...' : rawTitle;
    const cleanAuthor = song?.author || '未知歌手';
    const durStr = song?.duration
        ? song.duration <= 0
            ? '🔴 直播流'
            : MusicPresenter.formatDuration(song.duration)
        : '--:--';
    const titleMd = song?.url ? `## [${cleanTitle}](${song.url})` : `## ${cleanTitle}`;

    const userTag = executorId ? `<@${executorId}>` : '未知操作者';
    const channelTag = voiceChannelId ? `<#${voiceChannelId}>` : '語音頻道';
    const trackContent = `${titleMd}\n🎤 **${cleanAuthor}** • ⏱️ \`${durStr}\`\n-# 👤 由 ${userTag} 操作 • 🔊 ${channelTag}`;

    if (song?.thumbnail) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(trackContent))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(trackContent));
    }

    // 4. 接續曲目上下文區
    if (nextSong) {
        const nextRawTitle = nextSong.title || '接續曲目';
        const cleanNextTitle = nextRawTitle.length > 40 ? nextRawTitle.slice(0, 37) + '...' : nextRawTitle;
        const nextDurStr = nextSong.duration
            ? nextSong.duration <= 0
                ? '🔴 直播'
                : MusicPresenter.formatDuration(nextSong.duration)
            : '--:--';
        const nextTitleMd = nextSong.url ? `[${cleanNextTitle}](${nextSong.url})` : cleanNextTitle;

        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### 🎶 即將播放：${nextTitleMd}\n-# ⏱️ \`${nextDurStr}\` • 佇列剩餘 **${remainingCount}** 首歌曲`
                )
            );
    } else {
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('-# 📭 佇列已無後續歌曲，播放即將結束')
            );
    }

    // 5. 決策閉環播控按鈕行（上方配置實體分割線，清晰隔離數據區與操作區）
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:skip')
            .setLabel('繼續跳過')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music:queue')
            .setLabel('查看佇列')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music:open_play_modal')
            .setLabel('點歌')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Secondary)
    );

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(actionRow);

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder().setName('skip').setDescription('跳過當前歌曲').setDMPermission(false),
    category: 'music',
    cooldown: 2,
    helpText: '🔹 `/skip` - 跳過目前正在播放的歌曲',
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
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能跳過歌曲!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以跳過');
        }

        try {
            if (queue.loopMode === 'track') {
                queue.setLoopMode('none');
            }

            // 快照當前與接替曲目
            const currentSong = queue.currentSong ?? (queue.songs && queue.songs.length > 0 ? queue.songs[0] : null);
            const nonTtsSongs = (queue.songs || []).filter((s: any) => !s.isTTS);
            const nextSong = nonTtsSongs.length > 1 ? nonTtsSongs[1] : null;
            const remainingCount = Math.max(0, (queue.songs?.length || 1) - 1);

            bot.music.skip(interaction.guild.id);

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? (interaction.member as any)?.id;

            const payload = buildSkipCard({
                song: currentSong,
                voiceChannelId: voiceChannel.id,
                executorId,
                nextSong,
                remainingCount
            });

            if (typeof interaction.reply === 'function' && !interaction.deferred) {
                await interaction.reply(payload);
            } else if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (interaction.replied && typeof interaction.followUp === 'function') {
                await interaction.followUp(payload);
            } else if (typeof bot.sendSuccess === 'function') {
                await bot.sendSuccess(interaction, '⏭️ 跳過歌曲', '已成功為你跳過當前正在播放的歌曲');
            }
        } catch (err: any) {
            console.error('[Skip CMD]', err);
            await bot.sendError(interaction, '跳過失敗', '跳過歌曲時發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
