const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const path = require('path');
const CommandLoader = require('./bot/CommandLoader');
const EventLoader = require('./bot/EventLoader');
const BotResponsePresenter = require('./bot/BotResponsePresenter');
const AppContainerBuilder = require('./bot/AppContainerBuilder');

/**
 * BotClient — Core Discord Client Orchestrator.
 * Refactored for clean OOP / SOLID compliance:
 * - Composition Root delegated to AppContainerBuilder (DIP)
 * - UI response formatting delegated to BotResponsePresenter (SRP)
 * - Dynamic loading delegated to CommandLoader & EventLoader (SRP)
 * - Clean Service Container wiring (DIP / No cyclic dependencies)
 */
class BotClient extends Client {
    constructor(container = null) {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.container = container || AppContainerBuilder.buildDefaultContainer(this);
        this.commands = new Collection();
    }

    /** @returns {import('./AIClient')} */
    get ai() { return this.container.get('ai'); }

    /** @returns {import('./MusicManager')} */
    get music() { return this.container.get('music'); }

    /** @returns {import('./CooldownManager')} */
    get cooldowns() { return this.container.get('cooldowns'); }

    /** @returns {import('./GuildSettings')} */
    get settings() { return this.container.get('settings'); }

    /** @returns {import('./ValorantClient')} */
    get valorant() { return this.container.get('valorant'); }

    /** @returns {import('./LinkFixer')} */
    get linkFixer() { return this.container.get('linkFixer'); }

    /** @returns {import('./components/ComponentRouter')} */
    get components() { return this.container.get('components'); }

    /**
     * Dynamically mount all slash commands from the src/commands folder.
     */
    #loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        CommandLoader.loadCommands(commandsPath, this.commands, this.container);
    }

    /**
     * Dynamically mount all event handlers from the src/events folder.
     */
    #loadEvents() {
        const eventsPath = path.join(__dirname, '..', 'events');
        EventLoader.loadEvents(eventsPath, this);
    }

    /**
     * Finalized production bootloader.
     */
    async boot() {
        process.on('unhandledRejection', (err) => console.error('[Fatal Catch]', err.stack || err));

        // Eagerly initialize MusicManager so Shoukaku listener attaches before clientReady
        this.container.get('music');

        this.#loadCommands();
        this.#loadEvents();

        const token = process.env.DISCORD_TOKEN?.trim();
        if (!token) throw new Error('[Core] DISCORD_TOKEN is missing.');

        console.log('[Core] System initialized. Connecting to Discord gateway...');

        try {
            await this.login(token);
            console.log(`[Core] Logged in as ${this.user.tag}`);
        } catch (error) {
            console.error('[Core] Login failed:', error.message);
            throw error;
        }
    }

    /**
     * Global Error Responder formatting utility
     */
    async sendError(interaction, title, description) {
        return await BotResponsePresenter.sendError(interaction, title, description);
    }

    /**
     * Global Success Responder formatting utility
     */
    async sendSuccess(interaction, title, description, ephemeral = false) {
        return await BotResponsePresenter.sendSuccess(interaction, title, description, ephemeral);
    }

    /**
     * Graceful shutdown: flush all pending writes, then destroy the client.
     * @param {number} exitCode - Process exit code (0 = clean, 1 = restart)
     */
    async shutdown(exitCode = 0) {
        console.log('[Core] Graceful shutdown initiated...');

        this.settings.flush();
        this.valorant.flush();

        this.destroy();
        return exitCode;
    }
}

module.exports = BotClient;
