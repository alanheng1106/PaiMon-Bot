import { ButtonInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildJoinSuccessCard } from '../../commands/music/join';
import type BotClient from '../BotClient';

/**
 * MusicRejoinButtonHandler — Handles 'music:rejoin:<channelId>' button clicks from disconnect CV2 cards.
 * Provides instant one-click recovery to bring the bot back to voice after accidental disconnects.
 */
class MusicRejoinButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:rejoin';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查用戶是否在語音頻道
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能召回機器人！');
            }

            // 2. 檢查機器人身分資訊
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            if (!me) {
                return await bot.sendError(interaction, '語音連線遭拒', '無法取得機器人身分資訊！');
            }

            // 3. 檢查機器人是否已在語音頻道
            const botVoiceChannel = me.voice?.channel;
            if (botVoiceChannel) {
                if (botVoiceChannel.id === userVoiceChannel.id) {
                    return await bot.sendError(interaction, '已在頻道中', '我已經在該語音頻道中了！');
                }
                return await bot.sendError(
                    interaction,
                    '頻道衝突',
                    `我已經在 <#${botVoiceChannel.id}> 裡了，請先讓我離開或加入該頻道！`
                );
            }

            // 4. 檢查連線與說話權限
            const permissions = userVoiceChannel.permissionsFor(me);
            if (!permissions?.has(['Connect', 'Speak'])) {
                return await bot.sendError(
                    interaction,
                    '權限被拒絕',
                    '我在此頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限，無法進入！'
                );
            }

            // 5. 檢查文字頻道發言支援
            if (!interaction.channel || !interaction.channel.isTextBased()) {
                return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道發送訊息.');
            }

            // 6. 避免遠端語音連線 I/O 操作超時（防止 Discord 3 秒限制），執行前先行 defer
            if (typeof interaction.deferReply === 'function' && !interaction.deferred) {
                await interaction.deferReply();
            }

            // 7. 執行重新加入
            await bot.music.join(userVoiceChannel, interaction.channel);

            const botAvatarUrl =
                interaction.client?.user?.displayAvatarURL?.() ??
                bot?.user?.displayAvatarURL?.() ??
                (bot as any)?.client?.user?.displayAvatarURL?.();

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            const payload = buildJoinSuccessCard({
                voiceChannelId: userVoiceChannel.id,
                textChannelId: interaction.channel.id,
                executorId,
                botAvatarUrl: botAvatarUrl || undefined
            });

            if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (typeof bot.sendSuccess === 'function') {
                await bot.sendSuccess(interaction, '🔊 成功召回', `已成功重新加入語音頻道: <#${userVoiceChannel.id}>`);
            }
        } catch (err: any) {
            console.error('[MusicRejoinButtonHandler]', err);
            await bot.sendError(interaction, '召回失敗', '重新加入語音頻道時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicRejoinButtonHandler;
