import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const DURATION_MAP: Record<number, string> = {
    0: '解除禁言',
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

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('禁言指定成員或解除禁言')
        .addUserOption((option) => option.setName('user').setDescription('要禁言的成員').setRequired(true))
        .addIntegerOption((option) =>
            option
                .setName('duration')
                .setDescription('禁言時間長度 (選擇 0 可解除禁言)')
                .setRequired(true)
                .addChoices(
                    { name: '解除禁言 (0 秒)', value: 0 },
                    { name: '1 分鐘', value: 60 },
                    { name: '5 分鐘', value: 300 },
                    { name: '10 分鐘', value: 600 },
                    { name: '30 分鐘', value: 1800 },
                    { name: '1 小時', value: 3600 },
                    { name: '6 小時', value: 21600 },
                    { name: '12 小時', value: 43200 },
                    { name: '1 天', value: 86400 },
                    { name: '7 天', value: 604800 },
                    { name: '28 天', value: 2419200 }
                )
        )
        .addStringOption((option) => option.setName('reason').setDescription('禁言原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 3,
    helpText:
        '🔹 `/timeout [成員] [時間] [原因]` - 禁言成員 (支援 1 分鐘到 28 天，亦可選 0 秒解除禁言), 執行後會 DM 通知對方',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);
        const durationSeconds = interaction.options.getInteger('duration', true);
        const reason = interaction.options.getString('reason') || '未提供原因';

        // 機器人不可被禁言
        if (user.bot) {
            return await bot.sendError(interaction, '操作無效', '無法對機器人執行禁言操作.');
        }

        // 檢查機器人本身是否有「管理成員 / 禁言」權限
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我缺少「管理成員」(Moderate Members) 的權限, 請向伺服器管理員確認我的身分組權限.'
            );
        }

        // 同步前置防護（防自罰 / 防 Bot / 防伺服器擁有者）
        const preCheckErr = ModerationHelper.validateTarget(interaction, bot, user, null, { actionName: '執行禁言' });
        if (preCheckErr) {
            return await bot.sendError(interaction, '權限受限', preCheckErr);
        }

        // 避免後續 members.fetch / DM 通知 / member.timeout 等遠端 I/O 操作導致 3 秒交互超時
        await interaction.deferReply();

        try {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者.');
            }

            const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, {
                actionName: '執行禁言'
            });
            if (targetErr) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '權限受限', targetErr);
            }

            if (!member.moderatable) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(
                    interaction,
                    '權限溢位',
                    `我禁言不了這位成員, 請確認我的最高身分組高於 **${user.tag}**.`
                );
            }

            const isUntimeout = durationSeconds === 0;

            if (isUntimeout && !member.isCommunicationDisabled()) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '操作無效', `**${user.tag}** 目前並未處於禁言狀態.`);
            }

            const durationMs = isUntimeout ? null : durationSeconds * 1000;
            const durationLabel = DURATION_MAP[durationSeconds] ?? `${durationSeconds} 秒`;

            // 先執行禁言/解除禁言，成功後再發送通知，避免操作失敗導致虛假通知
            await member.timeout(durationMs, `By ${interaction.user.tag}: ${reason}`);

            const dmMessage = isUntimeout
                ? `🔓 你在 **${interaction.guild.name}** 的禁言已被解除.`
                : `⏳ 你已在 **${interaction.guild.name}** 被禁言 **${durationLabel}**.`;
            await ModerationHelper.notifyTarget(user, dmMessage, reason);

            const payload = ModerationHelper.buildActionableTimeoutCard({
                user,
                executor: interaction.user,
                durationSeconds,
                durationLabel,
                reason,
                isUntimeout
            });

            await interaction.editReply(payload as any);
        } catch (err) {
            console.error('[Timeout CMD]', err);
            await interaction.deleteReply().catch(() => null);
            await bot.sendError(interaction, '執行失敗', '禁言時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
