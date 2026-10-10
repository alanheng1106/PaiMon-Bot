import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
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
    User
} from 'discord.js';
import { Colors } from '../../config';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface BuildRenameActionCardOptions {
    targetUser: User;
    oldNickname: string | null;
    newNickname: string | null;
    executor: User;
}

/**
 * Builds the interactive CV2 card for nickname change / reset operations (Scheme C — Actionable Management Card).
 * Features:
 * - Accent Color: Info Blurple for custom rename, Carbon/Primary for reset
 * - Header: Contextual action title (### 📝 伺服器暱稱已變更 / ### 🔄 伺服器暱稱已重置)
 * - Section: Target user avatar thumbnail + Mention + Username/Tag + ID
 * - Diff Display: Full-width before ➜ after transition
 * - ActionRow: Interactive buttons (Rollback / Reset to default + Mod History query)
 * - Footer: Subtext with executor and dual timestamps (<t:timestamp:f> <t:timestamp:R>)
 */
export function buildRenameActionCard({
    targetUser,
    oldNickname,
    newNickname,
    executor
}: BuildRenameActionCardOptions) {
    const isReset = !newNickname;
    const accentColor = isReset ? Colors.Primary : Colors.Success;
    const timestamp = Math.floor(Date.now() / 1000);

    const avatarUrl =
        typeof targetUser.displayAvatarURL === 'function'
            ? targetUser.displayAvatarURL({ extension: 'png', size: 512 })
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const userDisplay = targetUser.tag ?? targetUser.username ?? '未知成員';
    const createdAt = (targetUser as any).createdTimestamp
        ? Math.floor((targetUser as any).createdTimestamp / 1000)
        : null;

    // 格式化差異對比
    const fromLabel = oldNickname ? `\`${oldNickname}\`` : '*(未設定)*';
    const diffContent = isReset ? `${fromLabel} ➜ *(已恢復預設名稱)*` : `${fromLabel} ➜ **\`${newNickname}\`**`;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. Heading 1 大標題（24px 粗體，權威且視覺錨點分明）
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(isReset ? '# 🔄 重置成員暱稱' : '# 📝 變更成員暱稱')
        )
        // 2. 標題與正文的實線分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 核心 Section：將成員身分、帳號時間與暱稱變更收攏於左側列，高度 1:1 完美契合右側 80px 頭像，消滅黑洞死角
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**<@${targetUser.id}>** (\`${userDisplay}\`)`),
                    new TextDisplayBuilder().setContent(
                        `-# ID：\`${targetUser.id}\`${createdAt ? `  •  帳號註冊於 <t:${createdAt}:R>` : ''}`
                    ),
                    new TextDisplayBuilder().setContent(`**暱稱變更**：${diffContent}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );

    // 4. 異構邊界分割線：分隔資料區與操作按鈕區
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // 5. 互動控制台按鈕行（克制、對稱）
    const actionRow = new ActionRowBuilder<ButtonBuilder>();

    if (oldNickname) {
        // 若存在舊暱稱，提供一鍵恢復原暱稱
        const encodedOld = Buffer.from(oldNickname).toString('base64url');
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`mod:rename:revert:${targetUser.id}:${encodedOld}`)
                .setLabel('恢復原暱稱')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Secondary)
        );
    } else if (newNickname) {
        // 若先前無自訂暱稱而新設了暱稱，提供一鍵重置回預設
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`mod:rename:reset:${targetUser.id}`)
                .setLabel('重置為預設')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // 處分記錄按鈕（聯動全局 ModHistoryButtonHandler）
    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`mod:history:${targetUser.id}`)
            .setLabel('處分記錄')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(actionRow);

    // 6. 底部審計元數據：單行極簡降權，緊隨按鈕，無多餘 Emoji 與換行
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# 執行人員：<@${executor.id}>  •  變更時間：<t:${timestamp}:R>`)
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('變更成員暱稱')
        .addUserOption((option) => option.setName('user').setDescription('要變更暱稱的成員').setRequired(true))
        .addStringOption((option) =>
            option.setName('nickname').setDescription('新暱稱 (留空則恢復預設使用者名稱)').setMaxLength(32)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/rename [成員] (新暱稱)` - 變更指定成員的伺服器暱稱，留空則重置為預設名稱',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);
        const rawNickname = interaction.options.getString('nickname');

        // 檢查機器人本身是否有「管理暱稱」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「管理暱稱」(Manage Nicknames) 的權限, 請向伺服器管理員確認我的身分組權限.'
            );
        }

        // 輸入內容格式驗證：防止純空白字元
        if (rawNickname !== null && rawNickname.trim().length === 0) {
            return await bot.sendError(
                interaction,
                '格式錯誤',
                '新暱稱不能全為空白字元. 若要恢復預設名稱, 請直接留空該選項.'
            );
        }

        const targetNickname = rawNickname ? rawNickname.trim() : null;

        // 同步前置防護（防自改 / 防 Bot / 防伺服器擁有者）
        const preCheckErr = ModerationHelper.validateTarget(interaction, bot, user, null, { actionName: '變更暱稱' });
        if (preCheckErr) {
            return await bot.sendError(interaction, '權限受限', preCheckErr);
        }

        // 避免後續 members.fetch 與 member.setNickname 遠端 I/O 導致 3 秒交互超時
        await interaction.deferReply();

        try {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者.');
            }

            // 執行者與目標成員身份組層級檢驗
            const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, {
                actionName: '變更暱稱'
            });
            if (targetErr) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '權限受限', targetErr);
            }

            // 機器人與目標成員身份組層級檢驗
            if (!member.manageable) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(
                    interaction,
                    '權限溢位',
                    `我無法管理此成員的暱稱! 請確保我的最高身分組高於 **${user.tag}**.`
                );
            }

            // 狀態比對（比對自訂暱稱 member.nickname，而非 fallback 到 username 的 displayName）
            const oldNickname = member.nickname;
            if (targetNickname === oldNickname || (!targetNickname && !oldNickname)) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(
                    interaction,
                    '無變更',
                    targetNickname ? '新暱稱與目前使用的伺服器暱稱完全相同.' : '該成員目前未設定自訂暱稱, 無需重置.'
                );
            }

            await member.setNickname(targetNickname);

            // 使用 Scheme C 專屬可操作回執卡片
            const payload = buildRenameActionCard({
                targetUser: user,
                oldNickname,
                newNickname: targetNickname,
                executor: interaction.user
            });

            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply(payload as any);
            } else {
                await interaction.reply(payload as any);
            }
        } catch (err) {
            console.error('[Rename CMD]', err);
            await interaction.deleteReply().catch(() => null);
            await bot.sendError(interaction, '執行失敗', '改暱稱時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
