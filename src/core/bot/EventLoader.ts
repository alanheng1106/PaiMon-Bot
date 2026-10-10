import fs from 'fs';
import path from 'path';
import type { Client } from 'discord.js';

/**
 * EventLoader — Dynamically mounts all event listeners from src/events folder.
 * Refactored for Single Responsibility Principle (SRP).
 */
class EventLoader {
    /**
     * Load events from directory onto a Discord Client.
     */
    static loadEvents(eventsPath: string, client: Client): number {
        if (!fs.existsSync(eventsPath)) return 0;

        let loadedCount = 0;
        const files = fs
            .readdirSync(eventsPath)
            .filter((f) => /\.[jt]s$/.test(f) && !f.endsWith('.d.ts') && !f.endsWith('.map'));
        for (const file of files) {
            const filePath = path.join(eventsPath, file);
            delete require.cache[require.resolve(filePath)];
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            let event = require(filePath);
            if (event.default) event = event.default;

            if (event.name && event.execute) {
                const handler = (...args: any[]) => {
                    if (args.includes(client)) {
                        return event.execute(...args);
                    }
                    return event.execute(...args, client);
                };
                if (event.once) {
                    client.once(event.name, handler);
                } else {
                    client.on(event.name, handler);
                }
                loadedCount++;
            }
        }
        return loadedCount;
    }
}

export default EventLoader;
