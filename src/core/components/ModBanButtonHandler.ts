import {
    ButtonInteraction,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../BotClient';

/**
 * ModBanButtonHandler — Handles defensive 'mod:ban:<userId>' button clicks.
 * Allows privileged moderators to quickly upgrade a kick to a full ban directly from the CV2 kick card.
 */
class ModBanButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:ban';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetUserId = interaction.customId.replace(/^mod:ban:/, '').trim();
        if (!/^\d{17,20}$/.test(targetUserId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID.');
        }

        // 1. 檢查點擊者是否具備「封鎖成員」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「封鎖成員」(Ban Members) 權限才能執行升級封鎖。'
            );
        }

        // 2. 檢查機器人本身是否具備「封鎖成員」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「封鎖成員」(Ban Members) 的權限，無法執行升級封鎖。'
            );
        }

        // 3. 避免遠端 I/O 操作超時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 4. 若成員仍在伺服器內，檢查階層保護
            const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (member && !member.bannable) {
                return await bot.sendError(
                    interaction,
                    '權限溢位',
                    '我封鎖不了這個人! 請確認我的最高身分組高於該成員。'
                );
            }

            // 5. 獲取使用者對象
            const targetUser = member?.user ??
                (await interaction.client.users.fetch(targetUserId).catch(() => null)) ?? {
                    id: targetUserId,
                    username: '未知使用者',
                    tag: '未知使用者'
                };

            // 6. 執行封鎖
            await interaction.guild.members.ban(targetUserId, {
                reason: ModerationHelper.formatAuditReason(
                    interaction.user,
                    '處分卡片快捷升級為封鎖 (Upgraded from Kick)'
                )
            });

            // 7. 嘗試將原卡片的按鈕設為已禁用（防止重複點擊與競態條件）
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
                                    .setLabel(btn.custom_id === interaction.customId ? '已升級為封鎖' : btn.label || '')
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
                // 忽略訊息編輯異常，不阻斷處分反饋
            }

            const payload = ModerationHelper.buildActionableBanCard({
                title: '成員封鎖處分 (升級生效)',
                user: targetUser as any,
                executor: interaction.user,
                reason: '由踢出處分快捷升級為封鎖'
            });
            payload.flags = (payload.flags | MessageFlags.Ephemeral) as any;

            if (interaction.deferred && !interaction.replied) await interaction.editReply(payload as any);
            else if (interaction.deferred || interaction.replied) await interaction.followUp(payload as any);
            else await interaction.reply(payload as any);
        } catch (err) {
            console.error('[ModBanButtonHandler] Ban failed:', err);
            await bot.sendError(interaction, '執行失敗', '升級封鎖時出了點問題，請稍後再試。');
        }
    }
}

export default ModBanButtonHandler;
