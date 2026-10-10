import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';

/**
 * MusicSkipButtonHandler — Handles 'music:skip' button interactions
 * from Scheme B Interactive Now Playing Console cards.
 * Skips the currently playing song with immediate confirmation.
 */
class MusicSkipButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:skip';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能跳過歌曲!');
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
                    `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能跳過歌曲!`
                );
            }

            // 4. 檢查佇列
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || (typeof queue.isEmpty === 'function' && queue.isEmpty()) || !queue.songs?.length) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以跳過!');
            }

            if (queue.loopMode === 'track') {
                queue.setLoopMode('none');
            }

            const currentSong = queue.songs[0];
            const songTitle = currentSong?.title
                ? currentSong.title.length > 40
                    ? currentSong.title.slice(0, 37) + '...'
                    : currentSong.title
                : '當前曲目';

            bot.music.skip(interaction.guild.id);

            await bot.sendSuccess(interaction, '⏭️ 跳過歌曲', `已為你跳過 **${songTitle}**`, true);
        } catch (err: any) {
            console.error('[MusicSkipButtonHandler]', err);
            await bot.sendError(interaction, '跳過失敗', '跳過歌曲時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicSkipButtonHandler;
