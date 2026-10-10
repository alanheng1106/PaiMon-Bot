import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { Emojis } from '../../config';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

interface WarningEntry {
    reason: string;
    timestamp: string;
    by: string;
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('警告指定成員並記錄')
        .addUserOption((option) => option.setName('user').setDescription('要警告的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('警告原因').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 3,
    helpText: '🔹 `/warn [成員] [原因]` - 警告成員並記錄, 累積次數可用 `/warnings` 查詢',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);

        // 機器人不可被警告
        if (user.bot) {
            return await bot.sendError(interaction, '操作無效', '無法對機器人執行警告操作.');
        }

        // 同步前置防護（防自罰 / 防 Bot / 防伺服器擁有者）
        const preCheckErr = ModerationHelper.validateTarget(interaction, bot, user, null, { actionName: '警告' });
        if (preCheckErr) {
            return await bot.sendError(interaction, '權限受限', preCheckErr);
        }

        // 避免後續 members.fetch / DM 通知等遠端 I/O 操作導致 3 秒交互超時
        await interaction.deferReply();

        try {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者.');
            }

            const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, { actionName: '警告' });
            if (targetErr) {
                await interaction.deleteReply().catch(() => null);
                return await bot.sendError(interaction, '權限受限', targetErr);
            }

            // Load current warnings from guild settings
            const guildWarnings: Record<string, WarningEntry[]> =
                bot.settings.get(interaction.guild.id, 'warnings') ?? {};
            const userWarnings: WarningEntry[] = guildWarnings[user.id] ?? [];

            const newEntry: WarningEntry = {
                reason,
                timestamp: new Date().toISOString(),
                by: interaction.user.tag
            };
            userWarnings.push(newEntry);
            guildWarnings[user.id] = userWarnings;
            bot.settings.set(interaction.guild.id, 'warnings', guildWarnings);

            const warnCount = userWarnings.length;

            // DM target (best effort)
            await ModerationHelper.notifyTarget(
                user,
                `${Emojis.Warning} 你在 **${interaction.guild.name}** 收到一次警告 (共 ${warnCount} 次).`,
                reason
            );

            const payload = ModerationHelper.buildActionableWarnCard({
                user,
                executor: interaction.user,
                reason,
                warnCount
            });

            await interaction.editReply(payload as any);
        } catch (err) {
            console.error('[Warn CMD]', err);
            await interaction.deleteReply().catch(() => null);
            await bot.sendError(interaction, '執行失敗', '記錄警告時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
