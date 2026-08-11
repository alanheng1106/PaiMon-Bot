const path = require('path');
const BaseJsonFileStore = require('../utils/BaseJsonFileStore');
const { Guild: GuildConfig } = require('../config');

/**
 * Lightweight JSON-based guild settings persistence.
 * Extends BaseJsonFileStore for debounced disk persistence.
 */
class GuildSettings extends BaseJsonFileStore {
    constructor() {
        const dataDir = path.join(__dirname, '..', '..', 'data');
        const filePath = path.join(dataDir, 'guild-settings.json');
        super(dataDir, filePath, GuildConfig.SaveDebounceMs || 500);
    }

    /**
     * Get a guild setting value.
     * @param {string} guildId
     * @param {string} key
     * @param {*} defaultValue
     * @returns {*}
     */
    get(guildId, key, defaultValue = null) {
        return this.data[guildId]?.[key] ?? defaultValue;
    }

    /**
     * Set a guild setting value and persist to disk.
     * @param {string} guildId
     * @param {string} key
     * @param {*} value
     */
    set(guildId, key, value) {
        if (!this.data[guildId]) this.data[guildId] = {};
        this.data[guildId][key] = value;
        this.save();
    }

    /**
     * Get link fixer settings for a guild with defaults.
     * @param {string} guildId
     */
    getLinkFixerSettings(guildId) {
        const defaultSettings = {
            fixMode: 'webhook', // 'webhook' | 'reply' | 'reply_suppress'
            deleteMsgEmoji: '❌',
            rotateFixEmoji: '🔄',
            disabledDomains: [], // list of domain keys (e.g. 'youtube', 'twitter')
            domainProviders: {} // domainKey -> providerId
        };
        const current = this.get(guildId, 'linkFixer', {});
        return { ...defaultSettings, ...current };
    }

    /**
     * Update link fixer settings for a guild.
     * @param {string} guildId
     * @param {Object} settings
     */
    setLinkFixerSettings(guildId, settings) {
        const current = this.getLinkFixerSettings(guildId);
        this.set(guildId, 'linkFixer', { ...current, ...settings });
    }
}

module.exports = GuildSettings;
