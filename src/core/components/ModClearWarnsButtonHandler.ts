import {
    ButtonInteraction,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';

/**
 * ModClearWarnsButtonHandler — Handles 'mod:clearwarns:<userId>' button clicks.
 * Allows privileged moderators to clear all past warning records for a user directly from the CV2 warnings dossier.
 */
class ModClearWarnsButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:clearwarns';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetUserId = interaction.customId.replace(/^mod:clearwarns:/, '').trim();
        if (!/^\d{17,20}$/.test(targetUserId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID.');
        }

        // 1. 檢查點擊者是否具備「管理成員」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理成員」(Moderate Members) 權限才能清除警告記錄。'
            );
        }

        // 2. 避免遠端 I/O 操作超時 (更新卡片與發送通知涉及遠端網路請求)
        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        try {
            // 2. 取得並檢查該伺服器與使用者的警告記錄
            const guildWarnings: Record<string, any[]> = bot.settings.get(interaction.guild.id, 'warnings') ?? {};
            const userWarnings = guildWarnings[targetUserId] ?? [];

            if (userWarnings.length === 0) {
                return await bot.sendError(
                    interaction,
                    '查無記錄',
                    `使用者 <@${targetUserId}> 目前在伺服器中沒有任何警告處分記錄可清除。`
                );
            }

            const clearedCount = userWarnings.length;

            // 3. 從設定中刪除該使用者的警告記錄
            delete guildWarnings[targetUserId];
            bot.settings.set(interaction.guild.id, 'warnings', guildWarnings);

            // 4. 嘗試將原卡片的清除按鈕設為已禁用，防止重複點擊
            try {
                if (interaction.message && interaction.message.components) {
                    const messageComponents = interaction.message.components;
                    const updateButtons = (row: any) => {
                        const rowJson = row.toJSON ? row.toJSON() : row;
                        if (rowJson.type === 1 && Array.isArray(rowJson.components)) {
                            const newRow = new ActionRowBuilder<ButtonBuilder>();
                            for (const btn of rowJson.components) {
                                const newBtn = new ButtonBuilder()
                                    .setCustomId(btn.custom_id)
                                    .setLabel(btn.custom_id === interaction.customId ? '已清除記錄' : btn.label || '')
                                    .setStyle(
                                        btn.custom_id === interaction.customId ? ButtonStyle.Secondary : btn.style
                                    )
                                    .setDisabled(btn.custom_id === interaction.customId ? true : Boolean(btn.disabled));
                                if (btn.emoji) newBtn.setEmoji(btn.emoji);
                                newRow.addComponents(newBtn);
                            }
                            return newRow.toJSON();
                        }
                        return rowJson;
                    };

                    const updatedComponents = messageComponents.map((c: any) => {
                        const raw = c.toJSON ? c.toJSON() : c;
                        if (raw.type === 1) {
                            return { toJSON: () => updateButtons(raw) };
                        }
                        if (raw.type === 17 && Array.isArray(raw.components)) {
                            const newContainer = {
                                ...raw,
                                components: raw.components.map((child: any) => updateButtons(child))
                            };
                            return { toJSON: () => newContainer };
                        }
                        return c;
                    });
                    await interaction.message.edit({ components: updatedComponents as any }).catch(() => {});
                }
            } catch {
                // 忽略按鈕更新異常
            }

            // 5. 回傳清除成功的通知
            await bot.sendSuccess(
                interaction,
                '清除成功',
                `已成功清除 <@${targetUserId}> 的共 **${clearedCount}** 次警告記錄。`,
                true
            );
        } catch (err) {
            console.error('[ModClearWarnsButtonHandler] Failed to clear warnings:', err);
            await bot.sendError(interaction, '執行失敗', '清除警告記錄時出了點問題，請稍後再試。');
        }
    }
}

export default ModClearWarnsButtonHandler;
