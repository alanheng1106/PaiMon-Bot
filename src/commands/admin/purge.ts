import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags,
    ChatInputCommandInteraction,
    GuildTextBasedChannel,
    User,
    Message
} from 'discord.js';
import { Colors, Emojis } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

function isBulkDeletableChannel(channel: unknown): channel is GuildTextBasedChannel {
    return !!channel && typeof channel === 'object' && 'bulkDelete' in channel;
}

const DANGER_COLOR = 0xda373c;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pure function: resolves user avatar URL with graceful fallback.
 */
function getUserAvatarUrl(user: User): string {
    return typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({ extension: 'png', size: 256 })
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

interface FilterPurgeOptions {
    targetUserId?: string | null;
    amount: number;
    maxAgeMs?: number;
    now?: number;
}

interface FilterPurgeResult {
    totalFound: number;
    validMessages: Message[];
    skipped: number;
}

/**
 * Pure function: filters messages by target author and Discord's 14-day bulk-delete restriction.
 * Decoupled from Discord API I/O for direct unit testability.
 */
function filterPurgeMessages(
    messages: Iterable<Message>,
    { targetUserId, amount, maxAgeMs = FOURTEEN_DAYS_MS, now = Date.now() }: FilterPurgeOptions
): FilterPurgeResult {
    const list = Array.from(messages);
    const filteredByUser = targetUserId
        ? list.filter((m) => m.author.id === targetUserId).slice(0, amount)
        : list.slice(0, amount);

    const cutoff = now - maxAgeMs;
    const validMessages = filteredByUser.filter((m) => m.createdTimestamp > cutoff);
    const skipped = filteredByUser.length - validMessages.length;

    return {
        totalFound: filteredByUser.length,
        validMessages,
        skipped
    };
}

/**
 * Builds the interactive CV2 card for successful or partially successful purge operations (Scheme C).
 */
function buildPurgeSuccessCard({
    deletedCount,
    skipped,
    targetUser,
    channel,
    executor
}: {
    deletedCount: number;
    skipped: number;
    targetUser: User | null;
    channel: GuildTextBasedChannel;
    executor: User;
}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const hasWarning = skipped > 0;
    const accentColor = hasWarning ? Colors.Warning : Colors.Success;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. Heading 1 大標題（建立頂層核心視覺錨點）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🗑️ 批量清理訊息完成'))
        // 2. 標題與正文的實線分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // 3. 核心數據區：若有指定目標成員，採用 Section + Thumbnail 配件契合右側頭像
    if (targetUser) {
        const avatarUrl = getUserAvatarUrl(targetUser);

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**目標成員**：<@${targetUser.id}> (\`${targetUser.tag}\`)`),
                    new TextDisplayBuilder().setContent(`**清除數量**：\`${deletedCount}\` 則訊息`),
                    new TextDisplayBuilder().setContent(`**執行頻道**：<#${channel.id}>`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );
    } else {
        // 全頻道清理：全寬清爽呈現
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**清除範圍**：頻道所有成員近期發言\n` +
                    `**清除數量**：\`${deletedCount}\` 則訊息\n` +
                    `**執行頻道**：<#${channel.id}>`
            )
        );
    }

    // 4. 次要限制提醒（置於 Section 外部全寬展示，防止手機窄屏擠壓文字）
    if (skipped > 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ${Emojis.Warning} **限制提醒**：已略過 **${skipped}** 則超過 14 天的歷史訊息 (Discord API 不支援批量刪除舊訊息)`
            )
        );
    }

    // 5. 互動控制台按鈕行（方案 C 核心：若有目標對象，提供即時審計與處分聯動）
    if (targetUser) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        const historyButton = new ButtonBuilder()
            .setCustomId(`mod:history:${targetUser.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary);

        const banButton = new ButtonBuilder()
            .setCustomId(`mod:ban:${targetUser.id}`)
            .setLabel('封鎖成員')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Danger);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(historyButton, banButton);
        container.addActionRowComponents(actionRow);
    }

    // 6. 底部審計元數據：極簡單行降權，無多餘符號
    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行管理員：<@${executor.id}>  •  執行時間：<t:${timestamp}:R>`)
        );

    return {
        components: [container as any],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

/**
 * Builds the CV2 warning card for empty result or aged messages.
 */
function buildPurgeWarningCard({
    title,
    description,
    tip,
    targetUser,
    executor
}: {
    title: string;
    description: string;
    tip?: string;
    targetUser?: User | null;
    executor: User;
}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const container = new ContainerBuilder()
        .setAccentColor(Colors.Warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${Emojis.Warning} ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (targetUser) {
        const avatarUrl = getUserAvatarUrl(targetUser);

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**目標成員**：<@${targetUser.id}> (\`${targetUser.tag}\`)`),
                    new TextDisplayBuilder().setContent(description)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );

        if (tip) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 💡 ${tip}`));
        }

        // 依然提供處分記錄按鈕，方便管理員調查該成員
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        const historyButton = new ButtonBuilder()
            .setCustomId(`mod:history:${targetUser.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary);
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(historyButton);
        container.addActionRowComponents(actionRow);
    } else {
        let body = description;
        if (tip) body += `\n-# 💡 ${tip}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行管理員：<@${executor.id}>  •  檢查時間：<t:${timestamp}:R>`)
        );

    return {
        components: [container as any],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

/**
 * Builds the CV2 error card for channel incompatibility or permission failures.
 */
function buildPurgeErrorCard({
    title,
    description,
    tip,
    executor
}: {
    title: string;
    description: string;
    tip?: string;
    executor: User;
}) {
    const timestamp = Math.floor(Date.now() / 1000);
    let body = description;
    if (tip) body += `\n-# 💡 ${tip}`;

    const container = new ContainerBuilder()
        .setAccentColor(DANGER_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${Emojis.Error} ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行管理員：<@${executor.id}>  •  中斷時間：<t:${timestamp}:R>`)
        );

    return {
        components: [container as any],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('批量刪除頻道訊息')
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('要刪除的訊息數量 (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption((option) => option.setName('user').setDescription('只刪除特定成員的訊息 (不填則刪除所有人)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/purge [數量] [使用者]` - 批量刪除最多 100 則訊息, 可指定特定成員',
    async execute(interaction: ChatInputCommandInteraction, _bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await interaction.reply({
                content: '此指令僅能在伺服器內使用。',
                flags: MessageFlags.Ephemeral
            });
        }

        const amount = interaction.options.getInteger('amount', true);
        const targetUser = interaction.options.getUser('user');
        const executor = interaction.user;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. 檢查執行者身分組權限
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
            const payload = buildPurgeErrorCard({
                title: '權限不足',
                description: '你需要「管理訊息 (Manage Messages)」權限才能執行此指令。',
                executor
            });
            return await interaction.editReply(payload);
        }

        const channel = interaction.channel;
        if (!isBulkDeletableChannel(channel)) {
            const payload = buildPurgeErrorCard({
                title: '無法執行批量刪除',
                description: '無法在此頻道批量刪除訊息。',
                tip: '僅支援伺服器文字頻道、討論串或語音文字頻道。',
                executor
            });
            return await interaction.editReply(payload);
        }

        // 2. 檢查機器人在該頻道的實效權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) {
            const payload = buildPurgeErrorCard({
                title: '機器人權限不足',
                description: '我缺少此頻道的「管理訊息 (Manage Messages)」權限，無法執行批量刪除。',
                tip: '請向伺服器管理員確認我在該頻道的發言與管理權限覆寫設定。',
                executor
            });
            return await interaction.editReply(payload);
        }

        try {
            // Fetch up to 100 messages when filtering by user to maximize search window
            const fetchLimit = targetUser ? 100 : amount;
            const fetched = await channel.messages.fetch({ limit: fetchLimit });

            // Delegate user and 14-day cutoff filtering to pure function
            const { totalFound, validMessages, skipped } = filterPurgeMessages(fetched.values(), {
                targetUserId: targetUser?.id,
                amount
            });

            if (totalFound === 0) {
                const payload = buildPurgeWarningCard({
                    title: '查無可刪除訊息',
                    description: targetUser
                        ? `在近期的訊息中找不到來自 <@${targetUser.id}> 的發言。`
                        : '當前頻道中沒有可刪除的訊息。',
                    tip: targetUser
                        ? '搜尋範圍為頻道最近的 100 則訊息，該成員近期可能未在此發言。'
                        : '請確認頻道內近期是否有訊息記錄。',
                    targetUser,
                    executor
                });
                return await interaction.editReply(payload);
            }

            if (validMessages.length === 0) {
                const payload = buildPurgeWarningCard({
                    title: '訊息皆已超過期限',
                    description: '找到的訊息均已超過 **14 天**。',
                    tip: '受限於 Discord API 安全規範，機器人無法批量刪除超過 14 天的歷史訊息。',
                    targetUser,
                    executor
                });
                return await interaction.editReply(payload);
            }

            const deleted = await channel.bulkDelete(validMessages, true);
            const deletedCount = deleted?.size || validMessages.length;

            const payload = buildPurgeSuccessCard({
                deletedCount,
                skipped,
                targetUser,
                channel,
                executor
            });

            await interaction.editReply(payload);
        } catch (err) {
            console.error('[Purge CMD]', err);
            const payload = buildPurgeErrorCard({
                title: '執行失敗',
                description: '刪除訊息時發生未預期的錯誤。',
                tip: '請確認機器人擁有此頻道的「管理訊息 (Manage Messages)」權限，且頻道未受特殊安全鎖定。',
                executor
            });
            await interaction.editReply(payload);
        }
    }
};

export default command;
