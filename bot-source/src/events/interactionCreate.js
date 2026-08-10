const { Events, MessageFlags } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        // ─── Slash Commands & Context Menu Commands ─────────────
        if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
            const command = bot.commands.get(interaction.commandName);
            if (!command) return;

            // Cooldown check
            if (command.cooldown) {
                const remaining = bot.cooldowns.check(interaction.commandName, interaction.user.id, command.cooldown);
                if (remaining) {
                    return interaction.reply({
                        content: `⏳ 冷卻中! 請等待 **${remaining}** 秒後再試.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await command.execute(interaction, bot);
            } catch (error) {
                console.error(`[Exec: ${interaction.commandName}] Failed:`, error.message);
                await bot.sendError(interaction, '發生未預期的錯誤', '指令執行時出了點問題, 請稍後再試.');
            }
            return;
        }

        // ─── Buttons, Modals, & Component Routing ───────────────
        if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
            try {
                await bot.components.handle(interaction, bot);
            } catch (error) {
                console.error('[Component] Failed:', error.message);
                await bot.sendError(interaction, '處理失敗', '處理組件互動時出了點問題, 請稍後再試.');
            }
        }
    }
};
