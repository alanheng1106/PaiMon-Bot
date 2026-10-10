import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildLoopCard } from '../../commands/music/loop';
import { buildNowPlayingCard } from '../../commands/music/nowplaying';
import type BotClient from '../BotClient';
import type { LoopMode } from '../music/GuildQueue';

/**
 * MusicLoopButtonHandler — Handles 'music:loop:<mode>' button interactions
 * from Scheme 3 Interactive Music Loop Dashboard cards as well as
 * 'music:loop:cycle' from Scheme B Now Playing cards.
 * Provides instant in-place mode switching and real-time button state updates.
 */
class MusicLoopButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:loop';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能調整循環模式!');
            }

            // 2. 檢查機器人是否在語音頻道
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            const botVoiceChannel = me?.voice?.channel;
            if (!botVoiceChannel) {
                return await bot.sendError(interaction, '無連線', '我目前不在任何語音頻道!');
            }

            // 3. 檢查用戶是否與機器人在同一個語音頻道
            if (botVoiceChannel.id !== userVoiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能調整循環模式!`
                );
            }

            // 4. 檢查佇列是否存在且非空
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || (typeof queue.isEmpty === 'function' && queue.isEmpty())) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放!');
            }

            // 5. 解析目標循環模式 (music:loop:none / track / queue / cycle)
            const parts = interaction.customId.split(':');
            let targetMode = parts[2] as LoopMode | 'cycle';
            const isCycle = targetMode === 'cycle';

            if (isCycle) {
                const currentMode = queue.loopMode || 'none';
                targetMode = currentMode === 'none' ? 'track' : currentMode === 'track' ? 'queue' : 'none';
            } else if (!targetMode || !['none', 'track', 'queue'].includes(targetMode)) {
                return await bot.sendError(interaction, '參數無效', '未知的循環模式。');
            }

            // 6. 設定循環模式
            queue.setLoopMode(targetMode as LoopMode);

            // 7. 構建即時更新卡片
            const currentSong = queue.songs?.[0];
            const songTitle = currentSong?.title
                ? currentSong.title.length > 40
                    ? currentSong.title.slice(0, 37) + '...'
                    : currentSong.title
                : undefined;

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            let payload: any;
            if (isCycle && currentSong) {
                const currentPosition = queue.player?.position ?? 0;
                const nextSong = queue.songs?.length > 1 ? queue.songs[1] : undefined;
                payload = buildNowPlayingCard({
                    song: currentSong,
                    voiceChannelId: queue.voiceChannelId ?? botVoiceChannel.id,
                    currentPosition,
                    isPaused: queue.player?.paused ?? false,
                    loopMode: targetMode as LoopMode,
                    queueLength: queue.songs?.length ?? 1,
                    nextSongTitle: nextSong?.title,
                    progressBar:
                        currentSong.duration > 0 && typeof bot.music?.createProgressBar === 'function'
                            ? bot.music.createProgressBar(currentPosition, currentSong.duration)
                            : undefined
                });
            } else {
                payload = buildLoopCard({
                    currentMode: targetMode as LoopMode,
                    songTitle,
                    queueLength: queue.songs?.length,
                    voiceChannelId: queue.voiceChannelId ?? botVoiceChannel.id,
                    executorId
                });
            }

            // 8. 原地更新卡片狀態（無縫切換按鈕高亮與禁用態）
            if (typeof interaction.update === 'function') {
                await interaction.update(payload);
            } else if (typeof interaction.editReply === 'function' && interaction.deferred) {
                await interaction.editReply(payload);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload);
            }
        } catch (err: any) {
            console.error('[MusicLoopButtonHandler]', err);
            await bot.sendError(interaction, '切換失敗', '切換循環模式時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicLoopButtonHandler;
