const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('批量刪除頻道訊息')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('要刪除的訊息數量 (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('只刪除特定使用者的訊息（不填則刪除所有人）'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/purge [數量] [使用者]` - 批量刪除最多 100 則訊息，可選擇只刪除特定成員的發言',
    async execute(interaction, bot) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch messages (fetch slightly more to account for filtering)
            const fetchLimit = targetUser ? Math.min(amount * 5, 100) : amount;
            const fetched = await interaction.channel.messages.fetch({ limit: fetchLimit });

            // Filter by user if specified
            let toDelete = targetUser
                ? [...fetched.values()].filter(m => m.author.id === targetUser.id).slice(0, amount)
                : [...fetched.values()].slice(0, amount);

            // Discord bulk delete only works on messages < 14 days old
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const validMessages = toDelete.filter(m => m.createdTimestamp > twoWeeksAgo);
            const skipped = toDelete.length - validMessages.length;

            if (validMessages.length === 0) {
                return interaction.editReply('❌ 沒有可刪除的訊息（超過 14 天的訊息無法批量刪除）。');
            }

            const deleted = await interaction.channel.bulkDelete(validMessages, true);

            let resultMsg = `✅ 已成功刪除 **${deleted.size}** 則訊息`;
            if (targetUser) resultMsg += `（來自 **${targetUser.tag}**）`;
            if (skipped > 0) resultMsg += `\n⚠️ 已略過 **${skipped}** 則超過 14 天的舊訊息`;

            await interaction.editReply(resultMsg);

        } catch (err) {
            console.error('[Purge CMD]', err);
            interaction.editReply('❌ 刪除過程中發生錯誤，請確認機器人擁有 `管理訊息` 的權限。');
        }
    },
};
