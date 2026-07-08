const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client, bot) {
        console.log(`[Process] Identity Verified: ${bot.user.username}`);

        try {
            const commandsData = bot.commands.map((cmd) => cmd.data.toJSON());

            if (process.env.NODE_ENV !== 'production' && process.env.GUILD_ID) {
                // Development mode: Register to a specific guild for instant updates
                const guild = await bot.guilds.fetch(process.env.GUILD_ID);
                await guild.commands.set(commandsData);
                console.log(`[Process] Synchronized ${commandsData.length} Slash Commands with Guild ${guild.name}.`);
            } else {
                // Production mode: Register globally (can take up to an hour to propagate)
                await bot.application.commands.set(commandsData);
                console.log(
                    `[Process] Synchronized ${commandsData.length} Slash Commands with Discord Global Registry.`
                );
            }

            bot.user.setPresence({
                activities: [{ name: '直接標記我來聊天!', type: 0 }],
                status: 'dnd'
            });
        } catch (error) {
            console.error('[Registry Failed]', error.message);
        }
    }
};
