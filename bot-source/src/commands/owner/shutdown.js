const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shutdown')
        .setDescription('關機機器人 (僅限擁有者)'),
    async execute(interaction, bot) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }

        await bot.sendSuccess(interaction, '⏹️ 系統關機', '🛑 機器人正在關機中... 再見', true);
        console.log(`[Core] Shutdown sequence initiated by ${interaction.user.tag}`);
        bot.destroy();
        process.exit(0);
    },
};
