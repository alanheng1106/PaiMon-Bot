import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChatInputCommandInteraction } from 'discord.js';
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
        .setName('warnings')
        .setDescription('查看指定成員的警告記錄')
        .addUserOption((option) => option.setName('user').setDescription('要查詢的成員').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: 'admin',
    helpText: '🔹 `/warnings [成員]` - 查看指定成員的警告記錄 (原因, 時間, 發出者)',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);

        try {
            const guildWarnings: Record<string, WarningEntry[]> =
                bot.settings.get(interaction.guild.id, 'warnings') ?? {};
            const userWarnings: WarningEntry[] = guildWarnings[user.id] ?? [];

            if (userWarnings.length === 0) {
                return await bot.sendSuccess(interaction, '📋 警告記錄', `**${user.tag}** 目前沒有任何警告記錄.`, true);
            }

            const payload = ModerationHelper.buildActionableWarningsCard({
                user,
                executor: interaction.user,
                warnings: userWarnings
            });

            await interaction.reply({
                components: payload.components as any,
                flags: ((payload.flags as any) | (MessageFlags.Ephemeral as any)) as any
            });
        } catch (err) {
            console.error('[Warnings CMD]', err);
            await bot.sendError(interaction, '執行失敗', '查詢警告記錄時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
