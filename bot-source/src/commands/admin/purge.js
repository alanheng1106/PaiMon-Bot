const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
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
        .addUserOption((option) => option.setName('user').setDescription('只刪除特定使用者的訊息（不填則刪除所有人）'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/purge [數量] [使用者]` - 批量刪除最多 100 則訊息，可選擇只刪除特定成員的發言',
    async execute(interaction, bot) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const replyEmbed = (color, title, description) => {
            const container = new ContainerBuilder()
                .setAccentColor(color)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${description}`));
            return interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        };

        try {
            // Fetch slightly more messages to account for per-user filtering
            const fetchLimit = targetUser ? Math.min(amount * 5, 100) : amount;
            const fetched = await interaction.channel.messages.fetch({ limit: fetchLimit });

            // Filter by user if specified
            let toDelete = targetUser
                ? [...fetched.values()].filter((m) => m.author.id === targetUser.id).slice(0, amount)
                : [...fetched.values()].slice(0, amount);

            // Discord bulk delete only works on messages < 14 days old
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const validMessages = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);
            const skipped = toDelete.length - validMessages.length;

            if (validMessages.length === 0) {
                return replyEmbed(
                    Colors.Warning,
                    '⚠️ 無可刪除訊息',
                    '沒有可刪除的訊息。\n> 超過 14 天的訊息無法透過批量刪除清除。'
                );
            }

            const deleted = await interaction.channel.bulkDelete(validMessages, true);

            let desc = `<a:check:1524601509772529665> 已成功刪除 **${deleted.size}** 則訊息`;
            if (targetUser) desc += `（來自 **${targetUser.tag}**）`;
            if (skipped > 0) desc += `\n> ⚠️ 已略過 **${skipped}** 則超過 14 天的舊訊息`;

            await replyEmbed(Colors.Success, '🗑️ 清除完成', desc);
        } catch (err) {
            console.error('[Purge CMD]', err);
            replyEmbed(Colors.Error, '<a:cross:1524603300752785550> 執行失敗', '刪除過程中發生錯誤，請確認機器人擁有 `管理訊息` 的權限。');
        }
    }
};
