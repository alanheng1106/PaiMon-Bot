const fs = require('fs');
const path = require('path');

/**
 * CommandLoader — Dynamically mounts all slash commands from src/commands folder.
 * Refactored for Single Responsibility Principle (SRP).
 */
class CommandLoader {
    /**
     * Load slash commands from directory into a target Collection.
     * @param {string} commandsPath 
     * @param {import('discord.js').Collection} commandsCollection 
     */
    /**
     * Load slash commands from directory into a target Collection.
     * @param {string} commandsPath 
     * @param {import('discord.js').Collection} commandsCollection 
     * @param {Object} [container] Optional ServiceContainer for command Dependency Injection
     */
    static loadCommands(commandsPath, commandsCollection, container = null) {
        if (!fs.existsSync(commandsPath)) return 0;

        let loadedCount = 0;
        const folders = fs.readdirSync(commandsPath);
        for (const folder of folders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'));
            for (const file of files) {
                const command = require(path.join(folderPath, file));
                if (command.data && command.execute) {
                    if (container) {
                        command.container = container;
                        if (typeof command.configure === 'function') {
                            try {
                                command.configure(container);
                            } catch (err) {
                                console.warn(`[CommandLoader] Failed to configure command ${command.data.name}:`, err.message);
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

module.exports = CommandLoader;
