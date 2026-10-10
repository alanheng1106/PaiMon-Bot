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
 * ModRenameButtonHandler — Handles defensive 'mod:rename:(reset|revert):<userId>[:<data>]' button clicks.
 * Enables privileged moderators to rollback or reset member nicknames directly from Scheme C CV2 cards.
 */
class ModRenameButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:rename';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const match = interaction.customId.match(/^mod:rename:(reset|revert):(\d{17,20})(?::(.+))?$/);
        if (!match) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的操作指令.');
        }

        const subAction = match[1];
        const targetUserId = match[2];
        const rawData = match[3];

        // 1. 檢查點擊者是否具備「管理暱稱」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理暱稱」(Manage Nicknames) 權限才能執行此操作。'
            );
        }

        // 2. 檢查機器人本身是否具備「管理暱稱」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「管理暱稱」(Manage Nicknames) 的權限，無法修改成員暱稱。'
            );
        }

        // 3. 避免遠端 I/O 逾時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 4. 獲取目標成員
            const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!member) {
                return await bot.sendError(interaction, '查無成員', '在伺服器中找不到該成員（可能已離開伺服器）。');
            }

            // 5. 階層與安全防護檢驗
            const targetErr = ModerationHelper.validateTarget(interaction, bot, member.user, member, {
                actionName: '變更暱稱'
            });
            if (targetErr) {
                return await bot.sendError(interaction, '權限受限', targetErr);
            }

            if (!member.manageable) {
                return await bot.sendError(
                    interaction,
                    '權限溢位',
                    `我無法管理此成員的暱稱! 請確保我的最高身分組高於 **${member.user.tag}**。`
                );
            }

            let successTitle = '';
            let successDescription = '';
            let buttonLabel = '';

            // 6. 執行重置或恢復
            if (subAction === 'reset') {
                if (!member.nickname) {
                    return await bot.sendError(interaction, '無變更', '該成員目前未設定自訂暱稱，無需重置。');
                }

                await member.setNickname(null);
                successTitle = '🔄 暱稱已重置';
                successDescription = `已成功將 **${member.user.tag}** 的暱稱重置為預設名稱。`;
                buttonLabel = '已重置為預設';
            } else if (subAction === 'revert') {
                if (!rawData) {
                    return await bot.sendError(interaction, '格式錯誤', '缺少可恢復的原暱稱資料。');
                }

                let revertedNick = '';
                try {
                    revertedNick = Buffer.from(rawData, 'base64url').toString('utf-8').trim();
                } catch {
                    return await bot.sendError(interaction, '格式錯誤', '原暱稱資料解析失敗。');
                }

                if (revertedNick.length === 0 || revertedNick.length > 32) {
                    return await bot.sendError(interaction, '格式錯誤', '原暱稱長度不符合規範 (1~32 字元)。');
                }

                if (member.nickname === revertedNick) {
                    return await bot.sendError(interaction, '無變更', `成員目前的暱稱已經是 \`${revertedNick}\`。`);
                }

                await member.setNickname(revertedNick);
                successTitle = '↺ 暱稱已恢復';
                successDescription = `已成功將 **${member.user.tag}** 的暱稱恢復為 \`${revertedNick}\`。`;
                buttonLabel = '已恢復原暱稱';
            }

            // 7. 將原卡片的按鈕設為已禁用，防止重複點擊與競態條件
            try {
                if (interaction.message && interaction.message.components) {
                    const messageComponents = interaction.message.components;
                    const updateButtons = (row: any) => {
                        const rowJson = row.toJSON ? row.toJSON() : row;
                        if (rowJson.type === 1 && Array.isArray(rowJson.components)) {
                            const newRow = new ActionRowBuilder<ButtonBuilder>();
                            for (const btn of rowJson.components) {
                                const isTarget = btn.custom_id === interaction.customId;
                                const newBtn = new ButtonBuilder()
                                    .setCustomId(btn.custom_id)
                                    .setLabel(isTarget ? buttonLabel : btn.label || '')
                                    .setStyle(isTarget ? ButtonStyle.Secondary : btn.style)
                                    .setDisabled(isTarget ? true : Boolean(btn.disabled));
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
                // 忽略原卡片更新錯誤，不阻斷反饋
            }

            // 8. 發送成功回執 (Ephemeral)
            await bot.sendSuccess(interaction, successTitle, successDescription, true);
        } catch (err) {
            console.error('[ModRenameButtonHandler] Operation failed:', err);
            await bot.sendError(interaction, '執行失敗', '變更暱稱時出了點問題，請確認我有足夠權限後再試。');
        }
    }
}

export default ModRenameButtonHandler;
