import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    User
} from 'discord.js';
import { Colors } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

type SlowmodeSupportedChannel = {
    setRateLimitPerUser(rateLimitPerUser: number, reason?: string): Promise<unknown>;
    name: string;
    id?: string;
};

function isSlowmodeChannel(channel: unknown): channel is SlowmodeSupportedChannel {
    if (!channel || typeof channel !== 'object') return false;
    const c = channel as Record<string, unknown>;
    return (
        'setRateLimitPerUser' in c &&
        typeof c.setRateLimitPerUser === 'function' &&
        'name' in c &&
        typeof c.name === 'string'
    );
}

export interface BuildSlowmodeConsoleCardOptions {
    channel: { id?: string; name: string };
    seconds: number;
    executor: User;
}

/**
 * Builds the interactive CV2 console card for slowmode channel rate limiting (Scheme B — Interactive Rate-Control Console).
 * Features:
 * - Accent Color: Security Alert Orange (0xe67e22) when throttled, Success Green (0x57f287) when disabled
 * - Header: Contextual action title (# 🛡️ 頻道流控管制生效 / # 🚀 頻道流控已解除)
 * - Divider: Small spacing divider line
 * - Data Display: Full-width clear channel mention (<#id>), formatted duration, and scope status
 * - Divider & ActionRow (when seconds > 0):
 *   - Quick Unlock / Reset button (Success, 🔓 解除慢速限制)
 *   - Adaptive Quick Adjustment button (Secondary, ⚡ 快速調為 5 秒 or 15 秒)
 * - Footer: Subtext with executor and relative timestamp (<t:timestamp:R>)
 */
export function buildSlowmodeConsoleCard({ channel, seconds, executor }: BuildSlowmodeConsoleCardOptions) {
    const isDisable = seconds === 0;
    const accentColor = isDisable ? Colors.Success : 0xe67e22;
    const timestamp = Math.floor(Date.now() / 1000);

    const formattedDuration =
        seconds >= 3600
            ? `${(seconds / 3600).toFixed(1)} 小時`
            : seconds >= 60
              ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
              : `${seconds} 秒`;

    const channelDisplay = channel.id ? `<#${channel.id}>` : `**#${channel.name}**`;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(isDisable ? '# 🚀 頻道流控已解除' : '# 🛡️ 頻道流控管制生效')
        )
        // 2. 標題與正文的實線分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 核心流控數據區（全寬展示，手機端永不擠壓換行）
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**目標頻道**：${channelDisplay}\n` +
                    `**當前限制**：${isDisable ? '`無限制` *(已恢復正常發言)*' : `**\`${formattedDuration}\`** 每則訊息`}`
            ),
            new TextDisplayBuilder().setContent(
                isDisable
                    ? '-# 狀態：常規模式  •  所有成員可即時傳送訊息'
                    : '-# 狀態：節流保護中  •  限制一般成員發言頻率，降低刷屏風險'
            )
        );

    // 4. 操作按鈕行 (異構邊界實線分割 + 按鈕行)
    if (channel.id) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        const actionRow = new ActionRowBuilder<ButtonBuilder>();

        if (!isDisable) {
            const quickSec = seconds === 5 ? 15 : 5;
            const quickLabel = seconds === 5 ? '快速調為 15 秒' : '快速調為 5 秒';

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod:slowmode:reset:${channel.id}`)
                    .setLabel('解除慢速限制')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`mod:slowmode:set:${channel.id}:${quickSec}`)
                    .setLabel(quickLabel)
                    .setEmoji('⚡')
                    .setStyle(ButtonStyle.Secondary)
            );
        } else {
            // 已解除慢速時，提供快速重新啟動檔位按鈕，讓控制台保持隨時可操作
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod:slowmode:set:${channel.id}:5`)
                    .setLabel('開啟 5 秒慢速')
                    .setEmoji('⚡')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`mod:slowmode:set:${channel.id}:15`)
                    .setLabel('開啟 15 秒慢速')
                    .setEmoji('⚡')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        container.addActionRowComponents(actionRow);
    }

    // 5. 底部審計元數據：極簡降權單行
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  設定時間：<t:${timestamp}:R>`)
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

export const buildActionableSlowmodeCard = buildSlowmodeConsoleCard;

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('設定當前頻道的慢速模式')
        .addIntegerOption((option) =>
            option
                .setName('seconds')
                .setDescription('冷卻秒數 (0 = 關閉, 最大 21600)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/slowmode [秒數]` - 設定慢速模式, 輸入 0 可關閉. 最長 6 小時 (21600 秒)',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const channel = interaction.channel;

        if (!isSlowmodeChannel(channel)) {
            return await bot.sendError(interaction, '操作無效', '無法在此頻道設定慢速模式');
        }

        const seconds = interaction.options.getInteger('seconds', true);

        // 避免後續 Discord REST API 遠端 I/O 導致 3 秒交互超時
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            await channel.setRateLimitPerUser(seconds, `By ${interaction.user.tag}`);

            const payload = buildSlowmodeConsoleCard({
                channel,
                seconds,
                executor: interaction.user
            });

            // 支援 CV2 控制台編輯回覆，並對缺少 editReply 的測試/環境提供向下相容 fallback
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(payload as any);
            } else {
                if (seconds === 0) {
                    await bot.sendSuccess(
                        interaction,
                        '🚀 慢速模式已關閉',
                        `**#${channel.name}** 的慢速模式已關閉`,
                        true
                    );
                } else {
                    const label =
                        seconds >= 3600
                            ? `${(seconds / 3600).toFixed(1)} 小時`
                            : seconds >= 60
                              ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
                              : `${seconds} 秒`;

                    await bot.sendSuccess(
                        interaction,
                        '🐢 慢速模式已啟用',
                        `**#${channel.name}** 的慢速模式已設定為 **${label}** 每則訊息`,
                        true
                    );
                }
            }
        } catch (err) {
            console.error('[Slowmode CMD]', err);
            return await bot.sendError(
                interaction,
                '執行失敗',
                '設定慢速模式時出了點問題, 請確認我有 `管理頻道` 的權限.'
            );
        }
    }
};

export default command;
