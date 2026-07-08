const fs = require('fs');
const path = require('path');
const { Guild: GuildConfig } = require('../config');

/**
 * Lightweight JSON-based guild settings persistence.
 * Reads from / writes to ./data/guild-settings.json.
 * Writes are debounced (500ms) to avoid frequent disk IO.
 */
class GuildSettings {
    constructor() {
        this.dataDir = path.join(__dirname, '..', '..', 'data');
        this.filePath = path.join(this.dataDir, 'guild-settings.json');
        this.data = {};
        this._debounceTimer = null;
        this._load();
    }

    _load() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            if (fs.existsSync(this.filePath)) {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            }
        } catch (err) {
            console.error('[GuildSettings] Failed to load settings file:', err.message);
            this.data = {};
        }
    }

    _save() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._writeSync();
        }, GuildConfig.SaveDebounceMs);
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
        this._save();
    }

    /**
     * Immediately persist to disk and cancel any pending debounce.
     * Used during graceful shutdown to avoid data loss.
     */
    flush() {
        clearTimeout(this._debounceTimer);
        this._writeSync();
    }

    /** @private */
    _writeSync() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[GuildSettings] Failed to save settings file:', err.message);
        }
    }
}

module.exports = GuildSettings;
