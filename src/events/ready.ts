import { Events, ActivityType } from 'discord.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type BotClient from '../core/BotClient';
import type { BotEvent } from '../types';

const COMMAND_CACHE_FILE = path.join(process.cwd(), 'data', '.commands-hash');

const readyEvent: BotEvent = {
    name: Events.ClientReady,
    once: true,
    async execute(bot: BotClient) {
        console.log(`[Process] Identity Verified: ${bot.user?.username}`);

        try {
            const commandsData = bot.commands.map((cmd) => cmd.data.toJSON());

            if (process.env.NODE_ENV !== 'production' && process.env.GUILD_ID) {
                // Development mode: Register to a specific guild for instant updates
                const guild = await bot.guilds.fetch(process.env.GUILD_ID);
                await guild.commands.set(commandsData);
                console.log(`[Process] Synchronized ${commandsData.length} Slash Commands with Guild ${guild.name}.`);
            } else if (bot.application) {
                // Production mode: Register globally with smart hash caching to protect 200/day limit
                const currentHash = crypto.createHash('sha256').update(JSON.stringify(commandsData)).digest('hex');
                let cachedHash = '';

                try {
                    if (fs.existsSync(COMMAND_CACHE_FILE)) {
                        cachedHash = fs.readFileSync(COMMAND_CACHE_FILE, 'utf8').trim();
                    }
                } catch {
                    // Ignore cache read error
                }

                const forceSync = process.env.FORCE_SYNC_COMMANDS === 'true';

                if (!forceSync && cachedHash === currentHash) {
                    console.log(
                        `[Process] Commands signature unchanged (${commandsData.length} commands). Skipped Discord Global Registry sync to preserve quota.`
                    );
                } else {
                    await bot.application.commands.set(commandsData);
                    console.log(
                        `[Process] Synchronized ${commandsData.length} Slash Commands with Discord Global Registry.`
                    );
                    try {
                        const dataDir = path.dirname(COMMAND_CACHE_FILE);
                        if (!fs.existsSync(dataDir)) {
                            fs.mkdirSync(dataDir, { recursive: true });
                        }
                        fs.writeFileSync(COMMAND_CACHE_FILE, currentHash, 'utf8');
                    } catch {
                        // Ignore cache write error
                    }
                }
            }

            bot.user?.setPresence({
                activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: '原神 启动!' }],
                status: 'dnd'
            });
        } catch (error: any) {
            console.error('[Registry Failed]', error.message);
        }
    }
};

export default readyEvent;
