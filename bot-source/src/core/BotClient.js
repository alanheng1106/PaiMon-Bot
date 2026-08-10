const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const path = require('path');
const AIClient = require('./AIClient');
const ValorantClient = require('./ValorantClient');
const MusicManager = require('./MusicManager');
const CooldownManager = require('./CooldownManager');
const GuildSettings = require('./GuildSettings');
const LinkFixer = require('./LinkFixer');
const ServiceContainer = require('./ServiceContainer');
const CommandLoader = require('./bot/CommandLoader');
const EventLoader = require('./bot/EventLoader');
const BotResponsePresenter = require('./bot/BotResponsePresenter');

const ComponentRouter = require('./components/ComponentRouter');
const ValUrlButtonHandler = require('./components/ValUrlButtonHandler');
const ValUrlModalHandler = require('./components/ValUrlModalHandler');

/**
 * BotClient — Core Discord Client Orchestrator.
 * Refactored for clean OOP / SOLID compliance:
 * - UI response formatting delegated to BotResponsePresenter (SRP)
 * - Dynamic loading delegated to CommandLoader & EventLoader (SRP)
 * - Service resolution via ServiceContainer (DIP)
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

        this.container = container || this._createDefaultContainer();
        this.commands = new Collection();
    }

    _createDefaultContainer() {
        const container = new ServiceContainer();
        const DomainRegistry = require('./linkfixer/DomainRegistry');
        const FilePromptProvider = require('./ai/FilePromptProvider');
        const ToolRegistry = require('./tools/ToolRegistry');
        const GetCurrentTimeTool = require('./tools/GetCurrentTimeTool');
        const WebSearchTool = require('./tools/WebSearchTool');

        container.register('domainRegistry', () => new DomainRegistry());
        container.register('linkFixer', (c) => new LinkFixer(c.get('domainRegistry')));
        container.register('promptProvider', () => new FilePromptProvider());
        container.register('toolRegistry', () => {
            const registry = new ToolRegistry();
            registry.register(new GetCurrentTimeTool());
            if (process.env.SERPER_API_KEY) {
                registry.register(new WebSearchTool());
            }
            return registry;
        });
        container.register('ai', (c) => new AIClient({
            toolRegistry: c.get('toolRegistry'),
            promptProvider: c.get('promptProvider')
        }));
        container.register('music', () => new MusicManager(this));
        container.register('cooldowns', () => new CooldownManager());
        container.register('settings', () => new GuildSettings());
        container.register('valorant', () => new ValorantClient());
        container.register('components', () => {
            const router = new ComponentRouter();
            router.register(new ValUrlButtonHandler());
            router.register(new ValUrlModalHandler());
            return router;
        });
        return container;
    }

    get ai() { return this.container.get('ai'); }
    get music() { return this.container.get('music'); }
    get cooldowns() { return this.container.get('cooldowns'); }
    get settings() { return this.container.get('settings'); }
    get valorant() { return this.container.get('valorant'); }
    get linkFixer() { return this.container.get('linkFixer'); }
    get components() { return this.container.get('components'); }

    /**
     * Dynamically mount all slash commands from the src/commands folder.
     */
    _loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        CommandLoader.loadCommands(commandsPath, this.commands);
    }

    /**
     * Dynamically mount all event handlers from the src/events folder.
     */
    _loadEvents() {
        const eventsPath = path.join(__dirname, '..', 'events');
        EventLoader.loadEvents(eventsPath, this);
    }

    /**
     * Finalized production bootloader.
     */
    async boot() {
        process.on('unhandledRejection', (err) => console.error('[Fatal Catch]', err.stack || err));

        // Eagerly initialize MusicManager so Shoukaku listener attaches before clientReady
        this.music;

        this._loadCommands();
        this._loadEvents();

        const token = process.env.DISCORD_TOKEN?.trim();
        if (!token) throw new Error('[Core] DISCORD_TOKEN is missing.');

        console.log('[Core] System initialized. Connecting to Discord gateway...');

        try {
            await this.login(token);
            console.log(`[Core] Logged in as ${this.user.tag}`);
        } catch (error) {
            console.error('[Core] Login failed:', error.message);
            process.exit(1);
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
        process.exit(exitCode);
    }
}

module.exports = BotClient;
