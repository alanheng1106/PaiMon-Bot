const { Events, MessageFlags } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        if (!interaction.isChatInputCommand()) return;

        const command = bot.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, bot);

        } catch (error) {
            console.error(`[Exec: ${interaction.commandName}] Failed:`, error.message);
            await bot.sendError(interaction, '系統核心攔截到預期外的錯誤', `錯誤資訊：\`\`\`\n${error.message}\n\`\`\``);
        }
    },
};
