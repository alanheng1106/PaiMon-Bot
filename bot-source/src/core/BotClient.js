const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const AIClient = require('./AIClient');
const MusicManager = require('./MusicManager');
const CooldownManager = require('./CooldownManager');
const GuildSettings = require('./GuildSettings');

class BotClient extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
            ]
        });

        this.commands = new Collection();
        this.ai = new AIClient();
        this.music = new MusicManager(this);
        this.cooldowns = new CooldownManager();
        this.settings = new GuildSettings();
    }

    /**
     * Dynamically mount all slash commands from the src/commands folder.
     */

    _loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        if (!fs.existsSync(commandsPath)) return;

        let loadedCount = 0;
        const folders = fs.readdirSync(commandsPath);
        for (const folder of folders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const command = require(path.join(folderPath, file));
                if (command.data && command.execute) {
                    this.commands.set(command.data.name, command);
                    loadedCount++;
                }
            }
        }
    }

    /**
     * Dynamically mount all event handlers from the src/events folder.
     */

    _loadEvents() {
        const eventsPath = path.join(__dirname, '..', 'events');
        if (!fs.existsSync(eventsPath)) return;

        const files = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const event = require(path.join(eventsPath, file));
            if (event.once) {
                this.once(event.name, (...args) => event.execute(...args, this));
            } else {
                this.on(event.name, (...args) => event.execute(...args, this));
            }
        }
    }

    /**
     * Finalized production bootloader.
     */
    async boot() {
        process.on('unhandledRejection', err => console.error('[Fatal Catch]', err.stack || err));

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
        const { EmbedBuilder, MessageFlags } = require('discord.js');
        const { Colors } = require('../config');
        const embed = new EmbedBuilder()
            .setColor(Colors.Error)
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setTimestamp();

        const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
        try {
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch {
            // Failsafe catch

        }
    }

    /**
     * Global Success Responder formatting utility
     */

    async sendSuccess(interaction, title, description, ephemeral = false) {
        const { EmbedBuilder, MessageFlags } = require('discord.js');
        const { Colors } = require('../config');
        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        const payload = { embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined };
        try {
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch {
            // Failsafe catch
        }
    }
}

module.exports = BotClient;
