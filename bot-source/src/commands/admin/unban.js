const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('解除封鎖指定的使用者')
        .addStringOption((option) => option.setName('userid').setDescription('要解封的使用者 ID').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('解封原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: 'admin',
    helpText: '🔹 `/unban [使用者ID] [原因]` - 解除封鎖已被 ban 的使用者（需輸入使用者 ID）',
    async execute(interaction, bot) {
        const userId = interaction.options.getString('userid').trim();
        const reason = interaction.options.getString('reason') || '未提供原因';

        // Validate that it looks like a Discord snowflake ID
        if (!/^\d{17,20}$/.test(userId)) {
            return bot.sendError(
                interaction,
                '格式錯誤',
                '請輸入有效的 Discord 使用者 ID（17-20 位數字）。\n> 在 Discord 中開啟開發者模式，右鍵點擊使用者即可複製 ID。'
            );
        }

        // Verify they are actually banned
        const banEntry = await interaction.guild.bans.fetch(userId).catch(() => null);
        if (!banEntry) {
            return bot.sendError(interaction, '未在封鎖名單', `使用者 ID \`${userId}\` 並不在此伺服器的封鎖名單中。`);
        }

        try {
            await interaction.guild.members.unban(userId, `By ${interaction.user.tag}: ${reason}`);
            await bot.sendSuccess(
                interaction,
                '<a:check:1524601509772529665> 解封成功',
                `<a:check:1524601509772529665> 已成功解除封鎖 **${banEntry.user.tag}**\n📋 原因：\`${reason}\``
            );
        } catch (err) {
            console.error('[Unban CMD]', err);
            bot.sendError(interaction, '執行失敗', '解封過程中發生內部錯誤，請稍後再試。');
        }
    }
};
