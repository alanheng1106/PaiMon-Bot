import fs from 'fs';
import path from 'path';
import type { Collection } from 'discord.js';
import type ServiceContainer from '../ServiceContainer';
import type { Command } from '../../types';

/**
 * CommandLoader — Dynamically mounts all slash commands from src/commands folder.
 * Refactored for Single Responsibility Principle (SRP).
 */
class CommandLoader {
    /**
     * Load slash commands from directory into a target Collection.
     */
    static loadCommands(
        commandsPath: string,
        commandsCollection: Collection<string, Command>,
        container: ServiceContainer | null = null
    ): number {
        if (!fs.existsSync(commandsPath)) return 0;

        let loadedCount = 0;
        const folders = fs.readdirSync(commandsPath);
        for (const folder of folders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const files = fs
                .readdirSync(folderPath)
                .filter((f) => /\.[jt]s$/.test(f) && !f.endsWith('.d.ts') && !f.endsWith('.map'));
            for (const file of files) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                let command = require(path.join(folderPath, file));
                if (command.default) command = command.default;

                if (command.data && command.execute) {
                    if (container) {
                        command.container = container;
                        if (typeof command.configure === 'function') {
                            try {
                                command.configure(container);
                            } catch (err: any) {
                                console.warn(
                                    `[CommandLoader] Failed to configure command ${command.data.name}:`,
                                    err.message
                                );
                            }
                        }
                    }
                    commandsCollection.set(command.data.name, command);
                    loadedCount++;
                }
            }
        }
        return loadedCount;
    }
}

export default CommandLoader;
