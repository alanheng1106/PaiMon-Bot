const fs = require('fs');
const path = require('path');

/**
 * EventLoader — Dynamically mounts all event listeners from src/events folder.
 * Refactored for Single Responsibility Principle (SRP).
 */
class EventLoader {
    /**
     * Load events from directory onto a Discord Client.
     * @param {string} eventsPath 
     * @param {import('discord.js').Client} client 
     */
    static loadEvents(eventsPath, client) {
        if (!fs.existsSync(eventsPath)) return 0;

        let loadedCount = 0;
        const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));
        for (const file of files) {
            const filePath = path.join(eventsPath, file);
            delete require.cache[require.resolve(filePath)];
            const event = require(filePath);
            if (event.name && event.execute) {
                client.removeAllListeners(event.name);
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
                loadedCount++;
            }
        }
        return loadedCount;
    }
}

module.exports = EventLoader;
