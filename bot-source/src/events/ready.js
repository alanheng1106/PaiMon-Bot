const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client, bot) {
        console.log(`[Process] Identity Verified: ${bot.user.username}`);

        try {
            const commandsData = bot.commands.map(cmd => cmd.data.toJSON());
            await bot.application.commands.set(commandsData);
            console.log(`[Process] Synchronized ${commandsData.length} Slash Commands with Discord Global Registry.`);

            bot.user.setPresence({
                activities: [{ name: '原神 启动!', type: 0 }],
                status: 'dnd'
            });
        } catch (error) {
            console.error('[Registry Failed]', error.message);
        }
    },
};
