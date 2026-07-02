const { Events, MessageFlags } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        if (!interaction.isChatInputCommand()) return;

        const command = bot.commands.get(interaction.commandName);
        if (!command) return;

        // Cooldown check
        if (command.cooldown) {
            const remaining = bot.cooldowns.check(interaction.commandName, interaction.user.id, command.cooldown);
            if (remaining) {
                return interaction.reply({
                    content: `⏳ 冷卻中！請等待 **${remaining}** 秒後再試。`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        try {
            await command.execute(interaction, bot);

        } catch (error) {
            console.error(`[Exec: ${interaction.commandName}] Failed:`, error.message);
            await bot.sendError(interaction, '系統核心攔截到預期外的錯誤', '指令執行時發生內部錯誤，請稍後再試。');
        }
    },
};
