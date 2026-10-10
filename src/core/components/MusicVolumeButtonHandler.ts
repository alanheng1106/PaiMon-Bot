import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildVolumeCard } from '../../commands/music/volume';
import type BotClient from '../BotClient';

/**
 * MusicVolumeButtonHandler — Handles 'music:volume:<action>:<value>' button interactions
 * from Scheme 3 Interactive Music Volume Controller cards.
 * Provides instant in-place volume adjustment and card updates.
 */
class MusicVolumeButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:volume';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能調整音量!');
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
                    `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能調整音量!`
                );
            }

            // 4. 檢查佇列是否存在且非空
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || (typeof queue.isEmpty === 'function' && queue.isEmpty())) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放!');
            }

            // 5. 解析目標音量 (music:volume:down:10 / music:volume:up:10 / music:volume:set:50)
            const parts = interaction.customId.split(':');
            const action = parts[2];
            const amount = parseInt(parts[3], 10) || 10;

            const currentVolume = bot.settings.get(interaction.guild.id, 'volume', 50) ?? 50;
            let newVolume = currentVolume;

            if (action === 'down') {
                newVolume = Math.max(1, currentVolume - amount);
            } else if (action === 'up') {
                newVolume = Math.min(100, currentVolume + amount);
            } else if (action === 'set') {
                newVolume = Math.max(1, Math.min(100, amount));
            } else {
                return await bot.sendError(interaction, '參數無效', '未知的音量操作指令。');
            }

            // 6. 設定音量並持久化
            bot.music.setVolume(interaction.guild.id, newVolume);
            bot.settings.set(interaction.guild.id, 'volume', newVolume);

            // 7. 構建即時更新卡片
            const currentSong = queue.currentSong ?? (queue.songs && queue.songs.length > 0 ? queue.songs[0] : null);
            const songTitle = currentSong?.title
                ? currentSong.title.length > 40
                    ? currentSong.title.slice(0, 37) + '...'
                    : currentSong.title
                : undefined;

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            const payload = buildVolumeCard({
                volume: newVolume,
                songTitle,
                voiceChannelId: botVoiceChannel.id,
                executorId
            });

            // 8. 原地更新卡片狀態
            if (typeof interaction.update === 'function') {
                await interaction.update(payload);
            } else if (typeof interaction.editReply === 'function' && interaction.deferred) {
                await interaction.editReply(payload);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload);
            }
        } catch (err: any) {
            console.error('[MusicVolumeButtonHandler]', err);
            await bot.sendError(interaction, '調整失敗', '調整音量時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicVolumeButtonHandler;
