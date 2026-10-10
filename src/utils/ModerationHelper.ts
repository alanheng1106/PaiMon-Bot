import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Interaction,
    User,
    GuildMember
} from 'discord.js';
import { Colors, Emojis } from '../config';

export interface ValidateTargetOptions {
    actionName?: string;
}

export interface PunishmentCardParams {
    title: string;
    color?: number;
    user: User;
    executor: User;
    reason: string;
    icon?: string;
    extraFields?: string[];
    actionRow?: ActionRowBuilder<ButtonBuilder>;
}

export interface ActionableWarnCardParams {
    title?: string;
    color?: number;
    user: User | { id: string; tag?: string; username?: string; displayAvatarURL?: any; createdTimestamp?: number };
    executor: User | { id: string; tag?: string; username?: string };
    reason: string;
    warnCount: number;
    maxThreshold?: number;
    icon?: string;
    extraFields?: string[];
}

export interface ActionableBanCardParams {
    title?: string;
    color?: number;
    user: User;
    executor: User;
    reason: string;
    icon?: string;
    extraFields?: string[];
}

export interface ActionableKickCardParams {
    title?: string;
    color?: number;
    user: User;
    executor: User;
    reason: string;
    icon?: string;
    extraFields?: string[];
}

export interface UnbanCardParams {
    title?: string;
    color?: number;
    user: User;
    executor: User;
    reason?: string;
    icon?: string;
}

export interface ActionableLockCardParams {
    title?: string;
    color?: number;
    channel: { id: string; name?: string };
    executor: User;
    guild?: { iconURL?: (options?: any) => string | null; name?: string } | null;
    reason?: string;
    icon?: string;
    extraAllowedRoles?: string[];
}

export interface ActionableUnlockCardParams {
    title?: string;
    color?: number;
    channel: { id: string; name?: string };
    executor: User | { id: string; tag?: string; username?: string };
    guild?: { iconURL?: (options?: any) => string | null; name?: string } | null;
    icon?: string;
}

export interface ActionableTimeoutCardParams {
    title?: string;
    color?: number;
    user: User | { id: string; tag?: string; username?: string; displayAvatarURL?: any; createdTimestamp?: number };
    executor: User | { id: string; tag?: string; username?: string };
    durationSeconds: number;
    durationLabel?: string;
    reason?: string;
    isUntimeout?: boolean;
    icon?: string;
}

export interface ActionableWarningsCardParams {
    title?: string;
    color?: number;
    user: User | { id: string; tag?: string; username?: string; displayAvatarURL?: any; createdTimestamp?: number };
    executor?: User | { id?: string; tag?: string; username?: string };
    warnings: Array<{ reason: string; timestamp: string; by: string }>;
    maxThreshold?: number;
    maxDisplay?: number;
    icon?: string;
    extraFields?: string[];
}

/**
 * ModerationHelper — Reusable utilities for admin moderation commands.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class ModerationHelper {
    /**
     * Validate target member for moderation action.
     */
    static validateTarget(
        interaction: Interaction | any,
        bot: any,
        user: User,
        member: GuildMember | null,
        options: ValidateTargetOptions = {}
    ): string | null {
        const { actionName = '執行此操作' } = options;

        if (user.id === interaction.user.id) {
            return '你不能對你自己執行此操作!';
        }
        if (user.id === bot.user.id) {
            return '我沒辦法對我自己執行此操作!';
        }
        if (user.id === interaction.guild?.ownerId) {
            return '你不能對伺服器擁有者執行此操作!';
        }

        if (member && interaction.member) {
            if (
                interaction.member.roles.highest.position <= member.roles.highest.position &&
                interaction.guild?.ownerId !== interaction.user.id
            ) {
                return `你的最高身分組不高於 **${user.tag}**, 無法${actionName}`;
            }
        }

        return null;
    }

    /**
     * Verify that the bot has the required permission in the guild.
     * Returns true if bot has permission, or sends an error and returns false.
     */
    static async checkBotPermission(
        interaction: Interaction | any,
        bot: any,
        permission: bigint,
        permissionName: string,
        permissionEnglish?: string
    ): Promise<boolean> {
        const me = interaction.guild?.members?.me ?? (await interaction.guild?.members?.fetchMe().catch(() => null));
        if (!me?.permissions.has(permission)) {
            const desc = permissionEnglish
                ? `我缺少「${permissionName}」(${permissionEnglish}) 的權限, 請向伺服器管理員確認我的身分組權限.`
                : `我缺少「${permissionName}」的權限, 請向伺服器管理員確認我的身分組權限.`;
            await bot.sendError(interaction, '權限不足', desc);
            return false;
        }
        return true;
    }

    /**
     * Format a uniform audit log reason.
     */
    static formatAuditReason(executor: User, reason: string): string {
        const executorTag = executor.tag || executor.username || 'Admin';
        return `By ${executorTag}: ${reason}`;
    }

    /**
     * Cleanly abort deferred interaction and report error.
     */
    static async abortWithError(
        interaction: Interaction | any,
        bot: any,
        title: string,
        description: string
    ): Promise<void> {
        await interaction.deleteReply().catch(() => null);
        await bot.sendError(interaction, title, description);
    }

    /**
     * Best-effort DM notification to moderation target.
     */
    static async notifyTarget(user: User, actionMessage: string, reason: string): Promise<any> {
        return await user
            .send(`${actionMessage}\n📋 原因: \`${reason}\``)
            .catch((e: any) => console.warn('[ModerationHelper] DM notification failed:', e.message));
    }

    /**
     * Build standard moderation container payload (Formal Audit Dossier style).
     */
    static buildPunishmentCard({
        title,
        color = Colors.Punish,
        user,
        executor,
        reason,
        icon,
        extraFields = [],
        actionRow
    }: PunishmentCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);

        // Determine contextual icon if not explicitly provided
        let resolvedIcon = icon;
        if (!resolvedIcon) {
            if (title.includes('封鎖')) resolvedIcon = '🔨';
            else if (title.includes('踢出')) resolvedIcon = '👢';
            else if (title.includes('解除禁言')) resolvedIcon = '🔓';
            else if (title.includes('禁言')) resolvedIcon = '⏳';
            else if (title.includes('警告')) resolvedIcon = Emojis.Warning;
            else resolvedIcon = '🛡️';
        }

        const username = user.username ?? user.tag ?? '未知使用者';
        const executorName = executor.username ?? executor.tag ?? '管理員';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. 标题区：消除绿色打勾冲突，使用对应处分语义 Emoji
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${resolvedIcon} ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 2. 核心 Section：专用于被处分人，两行高度与右侧头像 1:1 对齐，手机端不折行挤压
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${username}\`)\n-# 🆔 \`${user.id}\``)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            );

        // 3. 附加参数区（例如禁言时长、警告累积次数）
        if (extraFields && extraFields.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extraFields.join('\n')));
        }

        // 4. 理由区：独立展示，使用引用语法突出显示
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**📋 執行原因**\n${reason}`));

        // 可選操作按鈕行
        if (actionRow) {
            container.addActionRowComponents(actionRow);
        }

        // 5. 底部次要审计信息：使用 -# Subtext 降权，形成优美的收尾
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# 👮 執行人員：<@${executor.id}> (\`${executorName}\`)  •  🕒 處分時間：<t:${timestamp}:f> (<t:${timestamp}:R>)`
                )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload (Scheme B — Actionable Control Receipt).
     * Features:
     * - Left Accent: Punish coral or specified color
     * - Header: Contextual action title (### 🔨 成員封鎖生效)
     * - Section: Target user avatar thumbnail + Mention + ID + Account created timestamp
     * - Spacing: Gentle breathing room before reason (no visual grating)
     * - Reason: Blockquote formatted reason (> 📋 **封鎖原因**：...)
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Quick Unban button (Danger) + Mod History button (Secondary)
     * - Footer: Subtext with executor and dual timestamp (<t:timestamp:f> <t:timestamp:R>)
     */
    static buildActionableBanCard({
        title = '成員封鎖處分',
        color = 0xda373c,
        user,
        executor,
        reason,
        icon = '🔨',
        extraFields = []
    }: ActionableBanCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const userTag = user.tag ?? user.username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = (user as any).createdTimestamp ? Math.floor((user as any).createdTimestamp / 1000) : null;

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. 真正的 Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題與正文的清晰實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心 Section：將成員識別、註冊資訊與處分事由緊湊收攏於左側列，高度完美契合右側 80px 頭像，消滅黑洞死角
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${userTag}\`)`),
                        new TextDisplayBuilder().setContent(
                            `-# ID：\`${user.id}\`${createdAt ? `  •  帳號建立於 <t:${createdAt}:R>` : ''}`
                        ),
                        new TextDisplayBuilder().setContent(`**處分事由**：${reason}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            );

        // 4. 附加資訊區（若有）
        if (extraFields && extraFields.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extraFields.join('\n')));
        }

        // 5. 異構邊界分割線：分隔正文區與後續操作區
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. 操作按鈕行：兩按鈕等長對稱，風格克制精緻
        const unbanButton = new ButtonBuilder()
            .setCustomId(`mod:unban:${user.id}`)
            .setLabel('撤銷封鎖')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Danger);

        const historyButton = new ButtonBuilder()
            .setCustomId(`mod:history:${user.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(unbanButton, historyButton);
        container.addActionRowComponents(actionRow);

        // 7. 底部審計元數據：單行極簡降權，拿掉警察與時鐘 Emoji，不再重複打印用戶名
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  處分時間：<t:${timestamp}:R>`)
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload for kick (Scheme B — Actionable Control Receipt).
     * Features:
     * - Left Accent: Warm alert orange (0xe67e22) or configured color
     * - Header: Real Heading 1 with boots emoji (# 👢 成員踢出處分)
     * - Divider: Clean divider after title
     * - Section: Target user avatar thumbnail + Mention + Tag + ID + Account created timestamp + Reason
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Upgrade to Ban button (Danger, 🛑) + Mod History button (Secondary, 📜)
     * - Footer: Subtext with executor and relative timestamp (<t:timestamp:R>)
     */
    static buildActionableKickCard({
        title = '成員踢出處分',
        color = 0xe67e22,
        user,
        executor,
        reason,
        icon = '👢',
        extraFields = []
    }: ActionableKickCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const userTag = user.tag ?? user.username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = (user as any).createdTimestamp ? Math.floor((user as any).createdTimestamp / 1000) : null;

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題與正文的清晰實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心 Section：將成員識別、註冊資訊與處分事由緊湊收攏於左側列，高度完美契合右側 80px 頭像，消滅黑洞死角
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${userTag}\`)`),
                        new TextDisplayBuilder().setContent(
                            `-# ID：\`${user.id}\`${createdAt ? `  •  帳號建立於 <t:${createdAt}:R>` : ''}`
                        ),
                        new TextDisplayBuilder().setContent(`**處分事由**：${reason}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            );

        // 4. 附加資訊區（若有）
        if (extraFields && extraFields.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extraFields.join('\n')));
        }

        // 5. 異構邊界分割線：分隔正文區與後續操作區
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. 操作按鈕行：升級為封鎖（Danger）+ 處分記錄（Secondary）
        const upgradeBanButton = new ButtonBuilder()
            .setCustomId(`mod:ban:${user.id}`)
            .setLabel('升級為封鎖')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Danger);

        const historyButton = new ButtonBuilder()
            .setCustomId(`mod:history:${user.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(upgradeBanButton, historyButton);
        container.addActionRowComponents(actionRow);

        // 7. 底部審計元數據：單行極簡降權，拿掉冗餘 Emoji，手機端永不折行
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  處分時間：<t:${timestamp}:R>`)
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build unban success container payload (Unified CV2 Dossier style).
     * Features:
     * - Left Accent: Success green (0x57f287)
     * - Header: Real Heading 1 (# 🔓 解除封鎖成功)
     * - Divider: Clean line after title
     * - Section: Target user avatar thumbnail + Mention + Tag + ID + Account created timestamp + Reason
     * - Divider: Clean line before footer
     * - Footer: Subtext with executor and relative timestamp
     */
    static buildUnbanCard({
        title = '解除封鎖成功',
        color = Colors.Success,
        user,
        executor,
        reason = '未提供原因',
        icon = '🔓'
    }: UnbanCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const userTag = user.tag ?? user.username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = (user as any).createdTimestamp ? Math.floor((user as any).createdTimestamp / 1000) : null;

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. 真正的大標題（Heading 1，24px）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心 Section：成員身分 + 註冊時間 + 解封說明，右側契合頭像
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${userTag}\`)`),
                        new TextDisplayBuilder().setContent(
                            `-# ID：\`${user.id}\`${createdAt ? `  •  帳號建立於 <t:${createdAt}:R>` : ''}`
                        ),
                        new TextDisplayBuilder().setContent(`**解封事由**：${reason}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            // 4. 底部前實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 5. 底部審計元數據：極簡降權單行
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  解封時間：<t:${timestamp}:R>`)
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload for channel lock (Scheme B — Actionable Security Console).
     * Features:
     * - Left Accent: Alert orange (0xe67e22)
     * - Header: Heading 1 with shield emoji (# 🛡️ 頻道安全管制生效)
     * - Divider: Clean divider after title
     * - Section: Channel mention, scope subtext, reason quote, and right guild thumbnail
     * - Vulnerability Alert: Outside Section if extraAllowedRoles exist (to avoid mobile crushing)
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Quick Unlock button (Success, 🔓)
     * - Footer: Subtext with executor and relative timestamp (<t:timestamp:R>)
     */
    static buildActionableLockCard({
        title = '頻道安全管制生效',
        color = 0xe67e22,
        channel,
        executor,
        guild: _guild,
        reason = '未提供原因',
        icon = '🛡️',
        extraAllowedRoles = []
    }: ActionableLockCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. Heading 1 大標題（24px 粗體，頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心管制資訊：全寬清爽呈現，移除多餘的右側頭像與重複的 (#channel.name)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**目標頻道**：<#${channel.id}>\n` + `-# 🔒 管制範圍：\`@everyone\` (包含子討論串發言與建立)`
                ),
                new TextDisplayBuilder().setContent(`**鎖定原因**：${reason}`)
            );

        // 4. 身分組安全覆寫例外提示（置於全寬展示，避免折行）
        if (extraAllowedRoles && extraAllowedRoles.length > 0) {
            container
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# ${Emojis.Warning} **覆寫例外**：身分組 \`${extraAllowedRoles.join(', ')}\` 設有單獨發言許可，可繞過本次鎖定`
                    )
                );
        }

        // 5. 異構邊界分割線：分隔正文區與後續操作區
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. 快捷操作按鈕行：解除頻道鎖定 (Success 樣式，🔓 圖示)
        const unlockButton = new ButtonBuilder()
            .setCustomId(`mod:unlock:${channel.id}`)
            .setLabel('解除頻道鎖定')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Success);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(unlockButton);
        container.addActionRowComponents(actionRow);

        // 7. 底部審計元數據：極簡降權單行
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  鎖定時間：<t:${timestamp}:R>`)
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload for channel unlock (Scheme B — Actionable Security Console).
     * Features:
     * - Left Accent: Success green (Colors.Success)
     * - Header: Heading 1 with unlock emoji (# 🔓 頻道安全管制解除)
     * - Divider: Clean divider after title
     * - Status & Target: Channel mention and scope subtext
     * - Permissions Detail: Bullet list of restored permissions
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Quick Re-lock button (Secondary, 🔒)
     * - Footer: Subtext with executor and relative timestamp (<t:timestamp:R>)
     */
    static buildActionableUnlockCard({
        title = '頻道安全管制解除',
        color = Colors.Success,
        channel,
        executor,
        guild: _guild,
        icon = '🔓'
    }: ActionableUnlockCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);

        const container = new ContainerBuilder()
            .setAccentColor(color)
            // 1. Heading 1 大標題（24px 粗體，頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心受影響實體與權限恢復說明（全寬清爽呈現）
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**目標頻道**：<#${channel.id}>\n` + `-# 🌐 覆寫對象：\`@everyone\`（發言與討論串權限已恢復預設）`
                ),
                new TextDisplayBuilder().setContent(
                    `**恢復權限明細**：\n` +
                        `-# • 發送訊息 (Send Messages)\n` +
                        `-# • 建立與發言於討論串 (Threads Permissions)`
                )
            )
            // 4. 異構邊界分割線：分隔展示區與後續操作區
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // 5. 快捷操作按鈕行：再次鎖定頻道 (Secondary 樣式，🔒 圖示)
        const relockButton = new ButtonBuilder()
            .setCustomId(`mod:lock:${channel.id}`)
            .setLabel('再次鎖定頻道')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(relockButton);
        container.addActionRowComponents(actionRow);

        // 6. 底部審計元數據：極簡降權單行
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  解除時間：<t:${timestamp}:R>`)
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload for timeout/untimeout (Scheme B — Actionable Control Console).
     * Features:
     * - Left Accent: Alert orange (0xe67e22) for timeout, Success green (Colors.Success) for untimeout
     * - Header: Heading 1 with emoji (# ⏳ 成員禁言處分 / # 🔓 解除禁言生效)
     * - Divider: Clean divider after title
     * - Section: Target user avatar thumbnail + Mention + Tag + ID + Account created timestamp + Duration/Status
     * - Reason: Full-width reason block for responsive mobile wrapping
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Quick Untimeout button (Success, 🔓) + Mod History button (Secondary, 📜)
     *   or Re-timeout button (Secondary, ⏳) + Mod History button (Secondary, 📜)
     * - Footer: Subtext with executor and relative timestamp (<t:timestamp:R>)
     */
    static buildActionableTimeoutCard({
        title,
        color,
        user,
        executor,
        durationSeconds,
        durationLabel,
        reason = '未提供原因',
        isUntimeout,
        icon
    }: ActionableTimeoutCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const resolvedIsUntimeout = isUntimeout ?? durationSeconds === 0;
        const expiresTimestamp = timestamp + durationSeconds;
        const userTag = user.tag ?? user.username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = user.createdTimestamp ? Math.floor(user.createdTimestamp / 1000) : null;

        const resolvedColor = color ?? (resolvedIsUntimeout ? Colors.Success : 0xe67e22);
        const resolvedTitle = title ?? (resolvedIsUntimeout ? '解除禁言生效' : '成員禁言處分');
        const resolvedIcon = icon ?? (resolvedIsUntimeout ? '🔓' : '⏳');
        const resolvedDurationLabel = durationLabel ?? (resolvedIsUntimeout ? '解除禁言' : `${durationSeconds} 秒`);

        const container = new ContainerBuilder()
            .setAccentColor(resolvedColor)
            // 1. Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${resolvedIcon} ${resolvedTitle}`))
            // 2. 標題與正文的清晰實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // 3. 核心 Section：3 行文字與右側 80px 頭像形成 1:1 垂直對齊閉環，消滅黑洞死角
        const sectionTextLines = [
            `**<@${user.id}>** (\`${userTag}\`)`,
            `-# ID：\`${user.id}\`${createdAt ? `  •  帳號建立於 <t:${createdAt}:R>` : ''}`,
            resolvedIsUntimeout
                ? `**當前狀態**：\`發言許可已恢復\``
                : `**⏱️ 禁言時長**：\`${resolvedDurationLabel}\` (預計於 <t:${expiresTimestamp}:R> 解除)`
        ];

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(sectionTextLines[0]),
                    new TextDisplayBuilder().setContent(sectionTextLines[1]),
                    new TextDisplayBuilder().setContent(sectionTextLines[2])
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );

        // 4. 處分事由全寬獨立展示，避免手機窄列擠壓
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${resolvedIsUntimeout ? '解禁事由' : '處分事由'}**：${reason}`)
        );

        // 5. 異構邊界分割線：分隔正文區與後續操作區
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. 操作按鈕行
        const actionRow = new ActionRowBuilder<ButtonBuilder>();
        if (!resolvedIsUntimeout) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod:untimeout:${user.id}`)
                    .setLabel('提前解除禁言')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`mod:history:${user.id}`)
                    .setLabel('處分記錄')
                    .setEmoji('📜')
                    .setStyle(ButtonStyle.Secondary)
            );
        } else {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod:timeout:${user.id}:600`)
                    .setLabel('重新禁言 10 分鐘')
                    .setEmoji('⏳')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`mod:history:${user.id}`)
                    .setLabel('處分記錄')
                    .setEmoji('📜')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        container.addActionRowComponents(actionRow);

        // 7. 底部審計元數據：單行極簡降權，手機端永不折行
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# 執行人員：<@${executor.id}>  •  ${resolvedIsUntimeout ? '解禁時間' : '處分時間'}：<t:${timestamp}:R>`
            )
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable moderation container payload for warn (Scheme B — Actionable Control Receipt).
     * Features:
     * - Left Accent: Amber yellow (0xf1c40f) or Alert red (0xed4245) when warnCount reaches threshold
     * - Header: Real Heading 1 with warning emoji (# ⚠️ 成員警告處分)
     * - Divider: Clean divider after title
     * - Section: Target user avatar thumbnail + Mention + Tag + ID + Account created timestamp + Warning meter
     * - Reason: Full-width clean reason display (no Markdown blockquote '>' to eliminate double vertical lines)
     * - Divider: Clean divider before interactive actions
     * - ActionRow: Mod History button (Secondary, 📜) + optional Escalate to Timeout button (Danger, ⏳) if >= threshold
     * - Footer: Single-line subtext with executor mention and relative timestamp
     */
    static buildActionableWarnCard({
        title = '成員警告處分',
        color,
        user,
        executor,
        reason,
        warnCount,
        maxThreshold = 3,
        icon = Emojis.Warning,
        extraFields = []
    }: ActionableWarnCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const userTag = user.tag ?? user.username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = user.createdTimestamp ? Math.floor(user.createdTimestamp / 1000) : null;

        // 視覺化警告進度尺 (預設 3 次為升級處分警戒閾值)
        const threshold = maxThreshold ?? 3;
        const filled = Math.min(Math.max(warnCount, 0), threshold);
        const meter = Emojis.Warning.repeat(filled) + '⚪'.repeat(Math.max(0, threshold - filled));
        const isEscalated = warnCount >= threshold;

        // 當達到或超過升級閾值時，色條自動轉換為醒目警示紅
        const resolvedColor = color ?? (isEscalated ? 0xed4245 : 0xf1c40f);

        const container = new ContainerBuilder()
            .setAccentColor(resolvedColor)
            // 1. Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${icon} ${title}`))
            // 2. 標題與正文的清晰實線分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 3. 核心 Section：將成員識別、帳號元數據與警告計量尺緊湊收攏於左側列，高度與右側 80px 頭像完美契合
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${userTag}\`)`),
                        new TextDisplayBuilder().setContent(
                            `-# ID：\`${user.id}\`${createdAt ? `  •  帳號建立於 <t:${createdAt}:R>` : ''}`
                        ),
                        new TextDisplayBuilder().setContent(
                            `**警告狀態**：[ ${meter} ] \`${warnCount} 次\`${isEscalated ? ' (已達處分門檻)' : ''}`
                        )
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            // 4. 處分事由全寬獨立展示，避免 Markdown 雙豎線衝突與手機窄列擠壓
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**處分事由**：${reason}`));

        // 5. 附加資訊區（若有）
        if (extraFields && extraFields.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extraFields.join('\n')));
        }

        // 6. 異構邊界分割線：分隔正文區與後續操作區
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 7. 操作按鈕行：快捷查看歷史 + 超過門檻時一鍵升級禁言
        const actionRow = new ActionRowBuilder<ButtonBuilder>();

        const historyButton = new ButtonBuilder()
            .setCustomId(`mod:history:${user.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary);
        actionRow.addComponents(historyButton);

        if (isEscalated) {
            const timeoutEscalateButton = new ButtonBuilder()
                .setCustomId(`mod:timeout:${user.id}:600`)
                .setLabel('升級禁言 10 分鐘')
                .setEmoji('⏳')
                .setStyle(ButtonStyle.Danger);
            actionRow.addComponents(timeoutEscalateButton);
        }

        container.addActionRowComponents(actionRow);

        // 8. 底部審計元數據：單行極簡降權，手機端永不折行
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  記錄時間：<t:${timestamp}:R>`)
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build actionable warnings record container payload (Scheme B — Actionable Mod Console).
     * Refined Minimalist Aesthetic:
     * - Restrained palette: Warm amber for warning, danger red only when escalated, success green for clean
     * - Header: Real Heading 1 with single clean icon (# 📋 成員處分檔案)
     * - Divider: Clean divider after title (SeparatorSpacingSize.Small, Divider: true)
     * - Section: Target user mention + ID + Account created subtext + Blockquote status
     * - Divider: Clean divider before timeline records
     * - Timeline: Ultra-clean case timeline with padded index (`#01`), bold reasons, and relative timestamps
     * - Divider: Clean divider before action buttons
     * - ActionRow: Balanced, non-intrusive buttons (Secondary timeout, Danger ban only if escalated, Secondary refresh)
     * - Footer: Single-line minimalist subtext without emoji clutter
     */
    static buildActionableWarningsCard({
        title = '成員處分檔案',
        color,
        user,
        executor,
        warnings,
        maxThreshold = 3,
        maxDisplay = 10,
        icon = '📋',
        extraFields = []
    }: ActionableWarningsCardParams): { components: any[]; flags: MessageFlags } {
        const timestamp = Math.floor(Date.now() / 1000);
        const userTag = user.tag ?? (user as any).username ?? '未知使用者';
        const avatarUrl =
            typeof user.displayAvatarURL === 'function'
                ? user.displayAvatarURL({ extension: 'png', size: 512 })
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const createdAt = (user as any).createdTimestamp ? Math.floor((user as any).createdTimestamp / 1000) : null;

        const warnCount = warnings.length;
        const threshold = maxThreshold ?? 3;
        const isEscalated = warnCount >= threshold;

        // 色彩配置：達標為警戒紅 (0xda373c)，警告為琥珀黃 (0xf1c40f)，無記錄為成功綠
        const resolvedColor = color ?? (isEscalated ? 0xda373c : warnCount > 0 ? 0xf1c40f : Colors.Success);
        const resolvedIcon = icon ?? '📋';
        const executorId = executor?.id ?? '0';

        const container = new ContainerBuilder()
            .setAccentColor(resolvedColor)
            // 1. 大標題：單一俐落圖示，消除視覺雜訊
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${resolvedIcon} ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // 2. 成員肖像 Section：去 Emoji 化，簡潔高級
        const statusDetail =
            warnCount === 0
                ? '> **處分狀態**：`無違規記錄`'
                : `> **處分狀態**：\`${warnCount} 次警告\`${isEscalated ? ` · ${Emojis.Warning} **已達處分門檻**` : ''}`;

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**<@${user.id}>** (\`${userTag}\`)`),
                    new TextDisplayBuilder().setContent(
                        `-# ID: \`${user.id}\`${createdAt ? ` · 註冊於 <t:${createdAt}:R>` : ''}`
                    ),
                    new TextDisplayBuilder().setContent(statusDetail)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );

        // 3. 附加欄位資訊（若有）
        if (extraFields && extraFields.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extraFields.join('\n')));
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 4. 歷史時間線列表：去除鬧鐘、警察等光污染 Emoji，使用乾淨的等寬序號與相對時間
        if (warnings.length === 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### 歷史警告記錄\n-# 目前沒有任何警告處分記錄。`)
            );
        } else {
            const limit = Math.max(1, maxDisplay ?? 10);
            const displayWarnings = warnings.slice(-limit);
            const timelineLines = displayWarnings.map((w, i) => {
                const index = warnings.length - displayWarnings.length + i + 1;
                const paddedIndex = String(index).padStart(2, '0');
                const reason = w.reason.length > 100 ? `${w.reason.slice(0, 97)}...` : w.reason;
                const dateObj = new Date(w.timestamp);
                const unixTs = Math.floor(dateObj.getTime() / 1000);
                const timeStr = !isNaN(unixTs) ? `<t:${unixTs}:R>` : dateObj.toLocaleDateString('zh-TW');
                const byStr = w.by || '管理員';
                return `\`#${paddedIndex}\` **${reason}**\n-# ${timeStr} · 執行人：${byStr}`;
            });

            const summary =
                warnings.length > limit
                    ? `\n\n-# 顯示最近 ${limit} 筆（共累計 ${warnings.length} 筆處分）`
                    : `\n\n-# 累計警告共 ${warnings.length} 次`;

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### 歷史警告記錄\n${timelineLines.join('\n\n')}${summary}`)
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 5. 操作按鈕行：風格克制，避免兩顆大紅按鈕「核彈發射」視覺侵略
        const actionRow = new ActionRowBuilder<ButtonBuilder>();

        // 禁言按鈕 (克制的 Secondary 灰色樣式)
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`mod:timeout:${user.id}:600`)
                .setLabel('禁言 10 分鐘')
                .setEmoji('⏳')
                .setStyle(ButtonStyle.Secondary)
        );

        // 達到高危門檻時提供升級封鎖按鈕 (Danger)
        if (isEscalated) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod:ban:${user.id}`)
                    .setLabel('升級為封鎖')
                    .setEmoji('🛑')
                    .setStyle(ButtonStyle.Danger)
            );
        }

        // 清除記錄按鈕 (快捷清理該成員所有歷史記錄)
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`mod:clearwarns:${user.id}`)
                .setLabel('清除記錄')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(actionRow);

        // 6. 底部極簡審計元數據
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# 查詢人員：<@${executorId}> · 調閱時間：<t:${timestamp}:R> · 僅管理員可見`
            )
        );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }
}

export default ModerationHelper;
