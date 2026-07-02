const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('重新啟動機器人 (僅限擁有者)'),
    async execute(interaction, bot) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }

        await bot.sendSuccess(interaction, '🔄 系統重啟', '機器人正在重新啟動中... 稍後見！', true);
        console.log(`[Core] Restart sequence initiated by ${interaction.user.tag}`);

        bot.destroy();
        // Exiting the process will cause Docker's "restart: unless-stopped" policy to restart the bot
        process.exit(1);
    },
};
