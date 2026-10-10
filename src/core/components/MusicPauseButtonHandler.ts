import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildNowPlayingCard } from '../../commands/music/nowplaying';
import type BotClient from '../BotClient';

/**
 * MusicPauseButtonHandler — Handles 'music:toggle_pause' button interactions
 * from Scheme B Interactive Now Playing Console cards.
 * Provides instant in-place toggle between playing and paused states.
 */
class MusicPauseButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:toggle_pause';
    }

    override matches(customId: string): boolean {
        return customId === 'music:toggle_pause' || customId === 'music:pause' || customId === 'music:resume';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能控制播放!');
            }

            // 2. 檢查機器人是否在語音頻道
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            const botVoiceChannel = me?.voice?.channel;
            if (!botVoiceChannel) {
                return await bot.sendError(interaction, '無連線', '我目前不在任何語音頻道!');
            }

            // 3. 檢查是否在同一個語音頻道
            if (botVoiceChannel.id !== userVoiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能控制播放!`
                );
            }

            // 4. 檢查佇列
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || (typeof queue.isEmpty === 'function' && queue.isEmpty()) || !queue.songs?.length) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放!');
            }

            const isCurrentlyPaused = queue.player?.paused ?? false;
            if (isCurrentlyPaused) {
                bot.music.resume(interaction.guild.id);
            } else {
                bot.music.pause(interaction.guild.id);
            }

            const currentSong = queue.songs[0];
            const currentPosition = queue.player?.position ?? 0;
            const nextSong = queue.songs.length > 1 ? queue.songs[1] : undefined;

            const payload = buildNowPlayingCard({
                song: currentSong,
                voiceChannelId: queue.voiceChannelId ?? botVoiceChannel.id,
                currentPosition,
                isPaused: !isCurrentlyPaused,
                loopMode: queue.loopMode,
                queueLength: queue.songs.length,
                nextSongTitle: nextSong?.title,
                progressBar:
                    currentSong.duration > 0 && typeof bot.music?.createProgressBar === 'function'
                        ? bot.music.createProgressBar(currentPosition, currentSong.duration)
                        : undefined
            });

            if (typeof interaction.update === 'function') {
                await interaction.update(payload);
            } else if (typeof interaction.editReply === 'function' && interaction.deferred) {
                await interaction.editReply(payload);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload);
            }
        } catch (err: any) {
            console.error('[MusicPauseButtonHandler]', err);
            await bot.sendError(interaction, '操作失敗', '切換暫停狀態時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicPauseButtonHandler;
