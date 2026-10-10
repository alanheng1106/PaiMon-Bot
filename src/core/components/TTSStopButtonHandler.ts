import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';

/**
 * TTSStopButtonHandler — Handles 'tts:stop' button clicks on TTS broadcast console cards.
 * Allows users in the same voice channel to immediately stop voice playback.
 */
class TTSStopButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'tts:stop';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音錯誤', '請先加入語音頻道才能停止語音播放！');
            }

            // 2. 檢查機器人是否在語音頻道
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            const botVoiceChannel = me?.voice?.channel;
            if (!botVoiceChannel) {
                return await bot.sendError(interaction, '操作無效', '機器人目前未在任何語音頻道中！');
            }

            // 3. 檢查用戶與機器人是否在同一頻道
            if (botVoiceChannel.id !== userVoiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `你要跟機器人在同一個語音頻道 (<#${botVoiceChannel.id}>) 才能停止播放！`
                );
            }

            // 4. 檢查佇列並停止播放
            const queue = bot.music?.getQueue?.(interaction.guild.id);
            if (!queue || queue.isEmpty?.()) {
                return await bot.sendError(interaction, '操作無效', '當前沒有正在播放的語音或音訊內容。');
            }

            bot.music.stop(interaction.guild.id);
            await bot.sendSuccess(interaction, '⏹️ 語音已停止', '已成功停止語音播放並清空當前佇列。', true);
        } catch (err: any) {
            console.error('[TTSStopButtonHandler] Error stopping playback:', err);
            await bot.sendError(interaction, '執行失敗', '停止語音播放時發生內部錯誤，請稍後再試。');
        }
    }
}

export default TTSStopButtonHandler;
