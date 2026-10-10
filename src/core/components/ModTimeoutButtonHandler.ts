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

const DURATION_LABELS: Record<number, string> = {
    60: '1 分鐘',
    300: '5 分鐘',
    600: '10 分鐘',
    1800: '30 分鐘',
    3600: '1 小時',
    21600: '6 小時',
    43200: '12 小時',
    86400: '1 天',
    604800: '7 天',
    2419200: '28 天'
};

/**
 * ModTimeoutButtonHandler — Handles 'mod:timeout:<userId>:<seconds>' button clicks.
 * Allows privileged moderators to quickly re-timeout a member directly from a lifted timeout card.
 */
class ModTimeoutButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:timeout';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const match = interaction.customId.match(/^mod:timeout:(\d{17,20}):(\d+)$/);
        if (!match) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID 或時間參數.');
        }

        const [, targetUserId, secondsStr] = match;
        const seconds = parseInt(secondsStr, 10);
        if (isNaN(seconds) || seconds <= 0 || seconds > 2419200) {
            return await bot.sendError(interaction, '參數錯誤', '禁言秒數必須介於 1 秒至 28 天 (2,419,200 秒) 之間.');
        }

        // 1. 檢查點擊者是否具備「管理成員」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理成員」(Moderate Members) 權限才能執行禁言。'
            );
        }

        // 2. 檢查機器人本身是否具備「管理成員」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「管理成員」(Moderate Members) 的權限，無法執行禁言。'
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

            const durationLabel = DURATION_LABELS[seconds] ?? `${seconds} 秒`;

            // 6. 執行禁言
            await member.timeout(
                seconds * 1000,
                `By ${interaction.user.tag ?? interaction.user.username}: 處分卡片快捷重新禁言 (Quick Re-timeout)`
            );

            // 7. 私信通知目標成員
            await ModerationHelper.notifyTarget(
                member.user,
                `⏳ 你已在 **${interaction.guild.name}** 被重新禁言 **${durationLabel}**.`,
                '處分卡片快捷重新禁言'
            );

            // 8. 更新原卡片按鈕狀態（禁用點擊按鈕，避免重複操作）
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
                                    .setLabel(btn.custom_id === interaction.customId ? '已重新禁言' : btn.label || '')
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
                // 忽略訊息更新異常
            }

            // 9. 回傳禁言生效的 Scheme B 卡片 (Ephemeral)
            const payload = ModerationHelper.buildActionableTimeoutCard({
                title: '成員禁言處分',
                user: member.user,
                executor: interaction.user,
                durationSeconds: seconds,
                durationLabel,
                reason: '處分卡片快捷重新禁言',
                isUntimeout: false
            });
            payload.flags = (payload.flags | MessageFlags.Ephemeral) as any;

            if (interaction.deferred && !interaction.replied) await interaction.editReply(payload as any);
            else if (interaction.deferred || interaction.replied) await interaction.followUp(payload as any);
            else await interaction.reply(payload as any);
        } catch (err) {
            console.error('[ModTimeoutButtonHandler] Timeout failed:', err);
            await bot.sendError(interaction, '執行失敗', '重新禁言時出了點問題，請稍後再試。');
        }
    }
}

export default ModTimeoutButtonHandler;
