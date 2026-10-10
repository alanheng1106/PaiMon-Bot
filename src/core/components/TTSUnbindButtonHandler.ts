import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import { buildTTSReleaseCard, TTSSettings } from '../../commands/admin/ttschannel';
import type BotClient from '../BotClient';

/**
 * TTSUnbindButtonHandler — Handles 'tts:unbind:<channelId>' button clicks.
 * Allows privileged administrators to quickly unbind automated TTS directly from the Scheme B CV2 console card.
 * Updates the console card in-place dynamically without spawning duplicate messages.
 */
class TTSUnbindButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'tts:unbind';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            const targetChannelId = interaction.customId.replace(/^tts:unbind:/, '').trim();

            // 1. 檢查點擊者是否具備「管理伺服器」權限
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await bot.sendError(
                    interaction,
                    '權限不足',
                    '你需要「管理伺服器」(Manage Server) 權限才能解除自動 TTS 頻道設定。'
                );
            }

            const currentSettings = bot.settings.get<TTSSettings>(interaction.guild.id, 'tts');
            if (!currentSettings?.channelId) {
                return await bot.sendError(interaction, '操作無效', '目前尚未綁定任何自動 TTS 頻道。');
            }

            // 2. 解除設定
            bot.settings.set(interaction.guild.id, 'tts', null);

            // 3. 構建解除卡片並更新原有訊息
            const payload = buildTTSReleaseCard({
                channelId: targetChannelId || currentSettings.channelId,
                executor: interaction.user,
                guild: interaction.guild
            });

            if (typeof interaction.update === 'function') {
                await interaction.update(payload as any);
            } else if (interaction.deferred && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload as any);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload as any);
            } else {
                await bot.sendSuccess(interaction, '自動 TTS 頻道已解除', '伺服器已解除綁定自動語音頻道。');
            }
        } catch (err: any) {
            console.error('[TTSUnbindHandler] Error unbinding TTS channel:', err);
            return await bot.sendError(interaction, '執行失敗', '解除自動 TTS 頻道設定時出了點問題, 請稍後再試.');
        }
    }
}

export default TTSUnbindButtonHandler;
