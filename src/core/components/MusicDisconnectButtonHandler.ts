import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildDisconnectCard } from '../../commands/music/disconnect';
import type BotClient from '../BotClient';

/**
 * MusicDisconnectButtonHandler — Handles 'music:disconnect' and 'music:disconnect:<channelId>'
 * button clicks from join CV2 cards.
 * Provides instant one-click exit from the voice channel and delivers the disconnect card.
 */
class MusicDisconnectButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:disconnect';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查機器人是否在語音頻道
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            const botVoiceChannel = me?.voice?.channel;
            if (!botVoiceChannel) {
                return await bot.sendError(interaction, '無連線', '我目前不在任何語音頻道!');
            }

            // 2. 檢查用戶是否在同一個語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel || botVoiceChannel.id !== userVoiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能讓我離開!`
                );
            }

            // 3. 避免超時，先 deferReply
            if (typeof interaction.deferReply === 'function' && !interaction.deferred) {
                await interaction.deferReply();
            }

            // 4. 退出語音頻道並清空佇列
            bot.music.leave(interaction.guild.id);

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            const payload = buildDisconnectCard({
                voiceChannelId: botVoiceChannel.id,
                executorId
            });

            if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (interaction.replied && typeof interaction.followUp === 'function') {
                await interaction.followUp(payload);
            } else if (typeof interaction.reply === 'function' && !interaction.deferred) {
                await interaction.reply(payload);
            } else if (typeof bot.sendSuccess === 'function') {
                await bot.sendSuccess(interaction, '🔇 斷開連線', '已成功離開語音頻道');
            }
        } catch (err: any) {
            console.error('[MusicDisconnectButtonHandler]', err);
            await bot.sendError(interaction, '斷開失敗', '離開語音頻道時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicDisconnectButtonHandler;
