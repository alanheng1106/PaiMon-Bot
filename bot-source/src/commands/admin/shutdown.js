const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shutdown')
        .setDescription('關機機器人')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, bot) {
        await bot.sendSuccess(interaction, '⏹️ 系統關機', '🛑 機器人正在關機中... 再見', false);
        console.log(`[Core] Shutdown sequence initiated by ${interaction.user.tag}`);
        bot.destroy();
        process.exit(0);
    },
};
