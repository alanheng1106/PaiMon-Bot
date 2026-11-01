import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../BotClient';

/**
 * ModUnbanButtonHandler — Handles defensive 'mod:unban:<userId>' button clicks.
 * Allows privileged moderators to quickly rollback accidental bans directly from the CV2 ban card.
 */
class ModUnbanButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:unban';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetUserId = interaction.customId.replace(/^mod:unban:/, '').trim();
        if (!/^\d{17,20}$/.test(targetUserId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的使用者 ID.');
        }

        // 1. 檢查點擊者是否具備「封鎖成員」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
            return await bot.sendError(interaction, '權限不足', '你需要「封鎖成員」(Ban Members) 權限才能撤銷封鎖。');
        }

        // 2. 檢查機器人本身是否具備「封鎖成員」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「封鎖成員」(Ban Members) 的權限，無法執行撤銷封鎖。'
            );
        }

        // 3. 避免遠端 I/O 操作超時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 4. 檢查目標是否仍在封鎖名單中
            const banEntry = await interaction.guild.bans.fetch(targetUserId).catch(() => null);
            if (!banEntry) {
                return await bot.sendError(
                    interaction,
                    '未在封鎖名單',
                    `使用者 ID \`${targetUserId}\` 目前未在伺服器的封鎖名單中（可能已被其他管理員解除封鎖）。`
                );
            }

            // 5. 執行解封
            await interaction.guild.members.unban(
                targetUserId,
                `By ${interaction.user.tag}: 處分卡片快捷撤銷封鎖 (Quick Unban)`
            );

            // 6. 嘗試將原卡片的解封按鈕設為已禁用（防止重複點擊與競態條件）
            await ModerationHelper.disableCardButton(interaction, '已撤銷封鎖');

            const payload = ModerationHelper.buildUnbanCard({
                title: '解除封鎖成功',
                user: banEntry.user,
                executor: interaction.user,
                reason: '處分卡片快捷撤銷封鎖'
            });
            payload.flags = (payload.flags | MessageFlags.Ephemeral) as any;

            if (interaction.deferred && !interaction.replied) await interaction.editReply(payload as any);
            else if (interaction.deferred || interaction.replied) await interaction.followUp(payload as any);
            else await interaction.reply(payload as any);
        } catch (err) {
            console.error('[ModUnbanButtonHandler] Unban failed:', err);
            await bot.sendError(interaction, '執行失敗', '撤銷封鎖時出了點問題，請稍後再試。');
        }
    }
}

export default ModUnbanButtonHandler;
