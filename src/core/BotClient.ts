import { Client, GatewayIntentBits, Partials, Collection, RepliableInteraction } from 'discord.js';
import path from 'path';
import CommandLoader from './bot/CommandLoader';
import EventLoader from './bot/EventLoader';
import BotResponsePresenter from './bot/BotResponsePresenter';
import AppContainerBuilder from './bot/AppContainerBuilder';
import type ServiceContainer from './ServiceContainer';
import type { Command } from '../types';
import type AIClient from './AIClient';
import type MusicManager from './MusicManager';
import type LinkFixer from './LinkFixer';
import type ComponentRouter from './components/ComponentRouter';
import type CooldownManager from './CooldownManager';
import type GuildSettings from './GuildSettings';
import type ImageSynthesisService from './ai/ImageSynthesisService';
import type LargeFileCache from './ai/LargeFileCache';
import type UserMemoryStore from './ai/UserMemoryStore';
import type MemoryReflector from './ai/MemoryReflector';

/**
 * BotClient — Core Discord Client Orchestrator.
 * Refactored for clean OOP / SOLID compliance:
 * - Composition Root delegated to AppContainerBuilder (DIP)
 * - UI response formatting delegated to BotResponsePresenter (SRP)
 * - Dynamic loading delegated to CommandLoader & EventLoader (SRP)
 * - Clean Service Container wiring (DIP / No cyclic dependencies)
 */
class BotClient extends Client {
    public container: ServiceContainer;
    public commands: Collection<string, Command>;

    constructor(container: ServiceContainer | null = null) {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User]
        });

        this.container = container || AppContainerBuilder.buildDefaultContainer(this);
        this.commands = new Collection<string, Command>();
    }

    get ai(): AIClient {
        return this.container.get('ai');
    }
    get music(): MusicManager {
        return this.container.get('music');
    }
    get cooldowns(): CooldownManager {
        return this.container.get('cooldowns');
    }
    get settings(): GuildSettings {
        return this.container.get('settings');
    }
    get linkFixer(): LinkFixer {
        return this.container.get('linkFixer');
    }
    get components(): ComponentRouter {
        return this.container.get('components');
    }
    get imageService(): ImageSynthesisService | null {
        return this.container.has('imageService') ? this.container.get('imageService') : null;
    }
    get largeFileCache(): LargeFileCache | null {
        return this.container.has('largeFileCache') ? this.container.get('largeFileCache') : null;
    }
    get userMemoryStore(): UserMemoryStore | null {
        return this.container.has('userMemoryStore') ? this.container.get('userMemoryStore') : null;
    }
    get memoryReflector(): MemoryReflector | null {
        return this.container.has('memoryReflector') ? this.container.get('memoryReflector') : null;
    }

    /**
     * Dynamically mount all slash commands from the src/commands folder.
     */
    #loadCommands(): void {
        const commandsPath = path.join(__dirname, '..', 'commands');
        CommandLoader.loadCommands(commandsPath, this.commands, this.container);
    }

    /**
     * Dynamically mount all event handlers from the src/events folder.
     */
    #loadEvents(): void {
        const eventsPath = path.join(__dirname, '..', 'events');
        EventLoader.loadEvents(eventsPath, this);
    }

    /**
     * Finalized production bootloader.
     */
    async boot(): Promise<void> {
        process.on('unhandledRejection', (err: any) => console.error('[Fatal Catch]', err?.stack || err));

        // Eagerly initialize MusicManager so Shoukaku listener attaches before clientReady
        this.container.get('music');

        this.#loadCommands();
        this.#loadEvents();

        const token = process.env.DISCORD_TOKEN?.trim();
        if (!token) throw new Error('[Core] DISCORD_TOKEN is missing.');

        console.log('[Core] System initialized. Connecting to Discord gateway...');

        try {
            await this.login(token);
            console.log(`[Core] Logged in as ${this.user?.tag}`);
        } catch (error: any) {
            console.error('[Core] Login failed:', error.message);
            throw error;
        }
    }

    /**
     * Global Error Responder formatting utility
     */
    async sendError(interaction: RepliableInteraction | any, title: string, description: string): Promise<void> {
        return await BotResponsePresenter.sendError(interaction, title, description);
    }

    /**
     * Global Success Responder formatting utility
     */
    async sendSuccess(
        interaction: RepliableInteraction | any,
        title: string,
        description: string,
        ephemeral: boolean = false
    ): Promise<void> {
        return await BotResponsePresenter.sendSuccess(interaction, title, description, ephemeral);
    }

    /**
     * Graceful shutdown: flush all pending writes, then destroy the client.
     * @param exitCode - Process exit code (0 = clean, 1 = restart)
     */
    async shutdown(exitCode: number = 0): Promise<number> {
        console.log('[Core] Graceful shutdown initiated...');

        try {
            this.settings.flush();
        } catch (err: any) {
            console.error('[Core] Error flushing settings during shutdown:', err?.message || err);
        }

        try {
            this.userMemoryStore?.flush();
        } catch (err: any) {
            console.error('[Core] Error flushing user memories during shutdown:', err?.message || err);
        }

        this.destroy();
        return exitCode;
    }
}

export default BotClient;
