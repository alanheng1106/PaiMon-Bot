import {
    ButtonInteraction,
    PermissionFlagsBits,
    PermissionsBitField,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';

/**
 * ModUnlockButtonHandler — Handles defensive 'mod:unlock:<channelId>' button clicks.
 * Allows privileged moderators to quickly rollback channel locks directly from the Scheme B CV2 card.
 */
class ModUnlockButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:unlock';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const targetChannelId = interaction.customId.replace(/^mod:unlock:/, '').trim();
        if (!/^\d{17,20}$/.test(targetChannelId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的頻道 ID.');
        }

        // 1. 檢查點擊者是否具備「管理頻道」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理頻道」(Manage Channels) 權限才能解除頻道鎖定。'
            );
        }

        // 2. 獲取頻道對象 (優先從記憶體快取讀取，避免額外 REST API 往返延遲)
        const channel =
            (interaction.guild.channels.cache?.get(targetChannelId) as any) ??
            (await interaction.guild.channels.fetch(targetChannelId).catch(() => null));
        if (!channel || channel.isThread() || !('permissionOverwrites' in channel)) {
            return await bot.sendError(interaction, '查無頻道', '找不到指定的文字頻道或該頻道不支援修改權限覆寫。');
        }

        // 3. 檢查機器人本身是否具備「管理身分組與權限」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me) {
            return await bot.sendError(interaction, '權限不足', '無法取得機器人在本伺服器的身分資訊。');
        }

        const botPerms = channel.permissionsFor(me);
        if (!botPerms?.has(PermissionFlagsBits.ManageRoles)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我在該頻道缺少「管理身分組與權限」(Manage Roles) 權限，無法修改頻道覆寫設定。'
            );
        }

        // 4. 檢查頻道是否確實處於鎖定狀態
        const everyonePerms = (channel as any).permissionOverwrites.cache.get(interaction.guild.id);
        if (!everyonePerms?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return await bot.sendError(
                interaction,
                '頻道未鎖定',
                `頻道 <#${channel.id}> 目前未處於鎖定狀態（可能已被其他管理員解鎖）。`
            );
        }

        // 5. 避免遠端 I/O 操作超時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 6. 執行解鎖覆寫修改
            await (channel as any).permissionOverwrites.edit(
                interaction.guild.id,
                {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null
                },
                { reason: `By ${interaction.user.tag}: 處分卡片快捷解除頻道鎖定 (Quick Unlock)` }
            );

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
                                    .setLabel(isTarget ? '已解除鎖定' : btn.label || '')
                                    .setStyle(isTarget ? ButtonStyle.Secondary : btn.style)
                                    .setDisabled(isTarget ? true : Boolean(btn.disabled));
                                if (btn.emoji) newBtn.setEmoji(isTarget ? '🔓' : btn.emoji);
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
                // 忽略原卡片更新錯誤
            }

            // 8. 發送成功回執
            await bot.sendSuccess(
                interaction,
                '🔓 頻道已解鎖',
                `已成功為 <#${channel.id}> 解除鎖定，成員可以正常發言與建立討論串了。`,
                true
            );
        } catch (err) {
            console.error('[ModUnlockButtonHandler] Unlock failed:', err);
            await bot.sendError(interaction, '執行失敗', '解除頻道鎖定時出了點問題，請確認我有足夠權限後再試。');
        }
    }
}

export default ModUnlockButtonHandler;
