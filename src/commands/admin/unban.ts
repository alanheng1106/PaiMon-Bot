import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('解除封鎖指定的使用者')
        .addStringOption((option) => option.setName('userid').setDescription('要解封的使用者 ID').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('解封原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/unban [使用者ID] [原因]` - 解除封鎖已被 ban 的使用者 (需輸入 ID)',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const userId = interaction.options.getString('userid', true).trim();
        const reason = interaction.options.getString('reason') || '未提供原因';

        // Validate that it looks like a Discord snowflake ID
        if (!/^\d{17,20}$/.test(userId)) {
            return await bot.sendError(
                interaction,
                '格式錯誤',
                '請輸入有效的使用者 ID (17-20 位數字).\n> 在 Discord 開啟開發者模式, 對使用者按右鍵就能複製 ID.'
            );
        }

        // 檢查機器人本身是否有「封鎖成員」權限
        const hasPermission = await ModerationHelper.checkBotPermission(
            interaction,
            bot,
            PermissionFlagsBits.BanMembers,
            '封鎖成員',
            'Ban Members'
        );
        if (!hasPermission) return;

        // 避免後續 bans.fetch / members.unban 等遠端 I/O 操作導致 3 秒交互超時
        await interaction.deferReply();

        try {
            // Verify they are actually banned
            const banEntry = await interaction.guild.bans.fetch(userId).catch(() => null);
            if (!banEntry) {
                return await bot.sendError(
                    interaction,
                    '未在封鎖名單',
                    `使用者 ID \`${userId}\` 不在這個伺服器的封鎖名單中.`
                );
            }

            await interaction.guild.members.unban(userId, ModerationHelper.formatAuditReason(interaction.user, reason));
            const payload = ModerationHelper.buildUnbanCard({
                title: '解除封鎖成功',
                user: banEntry.user,
                executor: interaction.user,
                reason
            });
            await interaction.editReply(payload as any);
        } catch (err) {
            console.error('[Unban CMD]', err);
            await bot.sendError(interaction, '執行失敗', '解封時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
