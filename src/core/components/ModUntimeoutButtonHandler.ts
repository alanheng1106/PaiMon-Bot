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
 * ModUntimeoutButtonHandler — Handles defensive 'mod:untimeout:<userId>' button clicks.
 * Allows privileged moderators to quickly rollback or lift timeouts directly from the CV2 timeout card.
 */
class ModUntimeoutButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:untimeout';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetUserId = interaction.customId.replace(/^mod:untimeout:/, '').trim();
        if (!/^\d{17,20}$/.test(targetUserId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID.');
        }

        // 1. 檢查點擊者是否具備「管理成員」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理成員」(Moderate Members) 權限才能解除禁言。'
            );
        }

        // 2. 檢查機器人本身是否具備「管理成員」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「管理成員」(Moderate Members) 的權限，無法執行解除禁言。'
            );
        }

        // 3. 避免遠端 I/O 操作超時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 4. 取得目標成員
            const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!member) {
                return await bot.sendError(interaction, '查無成員', '在伺服器中找不到該成員（可能已離開伺服器）。');
            }

            // 5. 檢查階層保護
            if (!member.moderatable) {
                return await bot.sendError(
                    interaction,
                    '權限溢位',
                    `我無法操作此成員，請確認我的最高身分組高於 **${member.user.tag ?? member.user.username}**。`
                );
            }

            // 6. 檢查是否確實處於禁言狀態
            if (!member.isCommunicationDisabled()) {
                return await bot.sendError(
                    interaction,
                    '操作無效',
                    `**${member.user.tag ?? member.user.username}** 目前並未處於禁言狀態（可能已被其他管理員解除或已自然到期）。`
                );
            }

            // 7. 執行解除禁言
            await member.timeout(
                null,
                `By ${interaction.user.tag ?? interaction.user.username}: 處分卡片快捷解除禁言 (Quick Untimeout)`
            );

            // 8. 私信通知目標成員
            await ModerationHelper.notifyTarget(
                member.user,
                `🔓 你在 **${interaction.guild.name}** 的禁言已被管理員提前解除.`,
                '處分卡片快捷解除禁言'
            );

            // 9. 更新原卡片按鈕狀態（禁用解禁按鈕，避免重複點擊）
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
                                    .setLabel(btn.custom_id === interaction.customId ? '已提前解禁' : btn.label || '')
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
                // 忽略訊息更新異常，不阻斷解禁反饋
            }

            // 10. 回傳解禁成功的 Scheme B 卡片 (Ephemeral)
            const payload = ModerationHelper.buildActionableTimeoutCard({
                title: '解除禁言生效',
                user: member.user,
                executor: interaction.user,
                durationSeconds: 0,
                durationLabel: '解除禁言',
                reason: '處分卡片快捷解除禁言',
                isUntimeout: true
            });
            payload.flags = (payload.flags | MessageFlags.Ephemeral) as any;

            if (interaction.deferred && !interaction.replied) await interaction.editReply(payload as any);
            else if (interaction.deferred || interaction.replied) await interaction.followUp(payload as any);
            else await interaction.reply(payload as any);
        } catch (err) {
            console.error('[ModUntimeoutButtonHandler] Untimeout failed:', err);
            await bot.sendError(interaction, '執行失敗', '解除禁言時出了點問題，請稍後再試。');
        }
    }
}

export default ModUntimeoutButtonHandler;
