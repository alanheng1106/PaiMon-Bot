import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';
import { buildSlowmodeConsoleCard } from '../../commands/admin/slowmode';

/**
 * ModSlowmodeButtonHandler — Handles defensive 'mod:slowmode:(reset|set):<channelId>[:<seconds>]' button clicks.
 * Allows privileged moderators to quickly adjust or rollback channel slowmode directly from Scheme B CV2 console cards.
 * Updates the console card in-place dynamically without spawning duplicate messages.
 */
class ModSlowmodeButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'mod:slowmode';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const parts = interaction.customId.split(':');
        // Expected format:
        // ['mod', 'slowmode', 'reset', '<channelId>'] or ['mod', 'slowmode', 'set', '<channelId>', '<seconds>']
        if (parts.length < 4 || parts[0] !== 'mod' || parts[1] !== 'slowmode') {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的慢速控制參數。');
        }

        const action = parts[2];
        const targetChannelId = parts[3]?.trim();

        if (!targetChannelId || !/^\d{17,20}$/.test(targetChannelId)) {
            return await bot.sendError(interaction, '格式錯誤', '無法解析有效的頻道 ID。');
        }

        let targetSeconds: number;
        if (action === 'reset') {
            targetSeconds = 0;
        } else if (action === 'set') {
            const rawSeconds = parts[4];
            targetSeconds = parseInt(rawSeconds, 10);
            if (Number.isNaN(targetSeconds) || targetSeconds < 0 || targetSeconds > 21600) {
                return await bot.sendError(interaction, '格式錯誤', '無效的慢速冷卻秒數。');
            }
        } else {
            return await bot.sendError(interaction, '格式錯誤', '未知的慢速控制操作類型。');
        }

        // 1. 檢查點擊者是否具備「管理頻道」權限
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '你需要「管理頻道」(Manage Channels) 權限才能調整頻道慢速模式。'
            );
        }

        // 2. 獲取頻道對象 (優先從記憶體快取讀取，避免額外 REST API 往返延遲)
        const channel =
            (interaction.guild.channels.cache?.get(targetChannelId) as any) ??
            (await interaction.guild.channels.fetch(targetChannelId).catch(() => null));

        if (!channel || channel.isThread?.() || typeof channel.setRateLimitPerUser !== 'function') {
            return await bot.sendError(interaction, '查無頻道', '找不到指定的文字頻道或該頻道不支援設定慢速模式。');
        }

        // 3. 檢查機器人本身是否具備「管理頻道」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me) {
            return await bot.sendError(interaction, '權限不足', '無法取得機器人在本伺服器的身分資訊。');
        }

        const botPerms = channel.permissionsFor?.(me);
        if (!botPerms?.has(PermissionFlagsBits.ManageChannels)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我在該頻道缺少「管理頻道」(Manage Channels) 權限，無法調整慢速模式。'
            );
        }

        // 4. 檢查頻道是否已經是該狀態（冪等性防護）
        if (typeof channel.rateLimitPerUser === 'number' && channel.rateLimitPerUser === targetSeconds) {
            return await bot.sendError(
                interaction,
                '無變更',
                targetSeconds === 0
                    ? `頻道 <#${channel.id}> 目前未處於慢速模式。`
                    : `頻道 <#${channel.id}> 的慢速冷卻時間已經是 ${targetSeconds} 秒。`
            );
        }

        // 5. 避免遠端 I/O 操作超時，優先調用 deferUpdate 直接在原訊息原地響應，防止彈出額外多餘訊息
        let isDeferredUpdate = false;
        if (typeof interaction.deferUpdate === 'function') {
            await interaction.deferUpdate();
            isDeferredUpdate = true;
        } else if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        try {
            // 6. 執行慢速調整
            await channel.setRateLimitPerUser(
                targetSeconds,
                `By ${interaction.user.tag}: 處分卡片快捷調整慢速模式 (Quick Slowmode)`
            );

            // 同步記憶體快取中的 rateLimitPerUser
            if ('rateLimitPerUser' in channel) {
                channel.rateLimitPerUser = targetSeconds;
            }

            // 7. 重新構建 Scheme B 控制台卡片，實現原卡片按鈕與冷卻數值的即時原地更新
            const updatedCardPayload = buildSlowmodeConsoleCard({
                channel,
                seconds: targetSeconds,
                executor: interaction.user
            });

            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(updatedCardPayload as any);
            } else if (typeof interaction.update === 'function') {
                await interaction.update(updatedCardPayload as any);
            } else if (interaction.message && typeof interaction.message.edit === 'function') {
                await interaction.message.edit(updatedCardPayload as any).catch(() => {});
            } else if (!isDeferredUpdate) {
                // 若為不支援 editReply / deferUpdate 的舊版 Mock 環境，Fallback 回發成功通知
                if (targetSeconds === 0) {
                    await bot.sendSuccess(
                        interaction,
                        '🚀 慢速模式已解除',
                        `已成功解除 <#${channel.id}> 的慢速模式，成員可正常自由發言。`,
                        true
                    );
                } else {
                    await bot.sendSuccess(
                        interaction,
                        '⏱️ 慢速模式已調整',
                        `已成功將 <#${channel.id}> 的慢速模式調整為 **${targetSeconds} 秒** 每則訊息。`,
                        true
                    );
                }
            }
        } catch (err) {
            console.error('[ModSlowmodeButtonHandler] Slowmode update failed:', err);
            // Avoid overwriting the public console card via editReply when deferUpdate was used
            const errTarget =
                isDeferredUpdate && typeof interaction.followUp === 'function'
                    ? Object.assign(Object.create(interaction), { deferred: true, replied: true })
                    : interaction;
            await bot.sendError(errTarget, '執行失敗', '調整頻道慢速模式時出了點問題，請確認我有足夠權限後再試。');
        }
    }
}

export default ModSlowmodeButtonHandler;
