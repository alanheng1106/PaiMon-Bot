const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('unlock').setDescription('解鎖當前頻道，恢復一般成員發言'),
    category: 'admin',
    helpText: '🔹 `/unlock` - 解鎖當前頻道，讓 @everyone 恢復正常發言權限',
    async execute(interaction, bot) {
        const channel = interaction.channel;

        // Check if actually locked
        const everyonePerms = channel.permissionOverwrites.cache.get(interaction.guild.id);
        if (!everyonePerms?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return bot.sendError(interaction, '頻道未鎖定', '此頻道目前並沒有被鎖定！');
        }

        try {
            await channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                    SendMessages: null // null = inherit from role/default
                },
                { reason: `Unlocked by ${interaction.user.tag}` }
            );

            await bot.sendSuccess(
                interaction,
                '🔓 頻道已解鎖',
                `<a:check:1524601509772529665> **#${channel.name}** 已解鎖，成員可以重新正常發言。`
            );
        } catch (err) {
            console.error('[Unlock CMD]', err);
            bot.sendError(interaction, '執行失敗', '解鎖頻道時發生內部錯誤，請確認機器人擁有 `管理頻道` 的權限。');
        }
    }
};
