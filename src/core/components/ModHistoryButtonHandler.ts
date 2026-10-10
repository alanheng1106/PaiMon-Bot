import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../BotClient';

interface WarningEntry {
    reason: string;
    timestamp: string;
    by: string;
}

/**
 * ModHistoryButtonHandler — Handles defensive 'mod:history:<userId>' button clicks.
 * Ephemerally displays the member's full actionable warnings dossier (Scheme B).
 */
class ModHistoryButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:history';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetUserId = interaction.customId.replace(/^mod:history:/, '').trim();
        if (!/^\d{17,20}$/.test(targetUserId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID.');
        }

        // 1. 權限檢查：管理成員或封鎖成員
        if (
            !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) &&
            !interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)
        ) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理成員」(Moderate Members) 權限才能查看成員處分歷史。'
            );
        }

        // 2. 避免遠端 I/O 操作超時 (Fetch Member / User 涉及網路請求)
        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        try {
            const guildWarnings: Record<string, WarningEntry[]> =
                bot.settings.get(interaction.guild.id, 'warnings') ?? {};
            const userWarnings: WarningEntry[] = guildWarnings[targetUserId] ?? [];

            // 取得目標成員使用者物件 (安全相容各類 interaction 與 mock 物件)
            const targetMember = await interaction.guild?.members?.fetch?.(targetUserId)?.catch?.(() => null);
            const targetUser = targetMember?.user ??
                (await interaction.client?.users?.fetch?.(targetUserId)?.catch?.(() => null)) ??
                (await bot?.users?.fetch?.(targetUserId)?.catch?.(() => null)) ??
                (await (bot as any)?.client?.users?.fetch?.(targetUserId)?.catch?.(() => null)) ?? {
                    id: targetUserId,
                    tag: '未知使用者'
                };

            const payload = ModerationHelper.buildActionableWarningsCard({
                title: '處分歷史記錄',
                icon: '📜',
                user: targetUser,
                executor: interaction.user,
                warnings: userWarnings
            });

            // 確保私密展示 (Ephemeral)
            const replyPayload = {
                components: payload.components as any,
                flags: ((payload.flags as any) | (MessageFlags.Ephemeral as any)) as any
            };

            if (interaction.deferred && !interaction.replied) await interaction.editReply(replyPayload);
            else if (interaction.deferred || interaction.replied) await interaction.followUp(replyPayload);
            else await interaction.reply(replyPayload);
        } catch (err) {
            console.error('[ModHistoryButtonHandler] Failed to query warnings:', err);
            await bot.sendError(interaction, '執行失敗', '查詢處分歷史時出了點問題，請稍後再試。');
        }
    }
}

export default ModHistoryButtonHandler;
