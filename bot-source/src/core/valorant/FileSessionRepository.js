const path = require('path');
const crypto = require('crypto');
const BaseJsonFileStore = require('../../utils/BaseJsonFileStore');
const { Valorant: ValConfig } = require('../../config');

/**
 * FileSessionRepository — Manages persistence and encryption for Valorant sessions.
 * Refactored to extend BaseJsonFileStore for clean OOP & DRY compliance.
 */
class FileSessionRepository extends BaseJsonFileStore {
    #encryptionKey;

    constructor(dataDir = null, filePath = null, encryptionSource = null) {
        const defaultDataDir = dataDir || path.join(__dirname, '..', '..', '..', 'data');
        const defaultFilePath = filePath || path.join(defaultDataDir, 'val-sessions.json');
        
        if (!encryptionSource && !process.env.ENCRYPTION_KEY) {
            console.warn('[FileSessionRepository] ENCRYPTION_KEY is not set. Falling back to default token hash.');
        }

        const source = encryptionSource || process.env.ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'no-key-configured';
        
        super(defaultDataDir, defaultFilePath, ValConfig.SaveDebounceMs || 1000);

        this.#encryptionKey = crypto.createHash('sha256').update(String(source)).digest();
        this.load();
    }

    /** @override */
    _parseData(raw) {
        try {
            let keyInitialized = false;
            try {
                keyInitialized = Boolean(this.#encryptionKey);
            } catch {
                keyInitialized = false;
            }

            const decryptedData = keyInitialized ? this.#decrypt(raw) : raw;
            return JSON.parse(decryptedData);
        } catch (err) {
            console.warn('[FileSessionRepository] Failed to parse session data:', err.message);
            return {};
        }
    }

    /** @override */
    _serializeData(data) {
        const rawData = JSON.stringify(data, null, 2);
        return this.#encrypt(rawData);
    }

    /**
     * Get all sessions for a Discord user.
     * @param {string} discordUserId 
     * @returns {Object|null} Map of riotId -> sessionData or null
     */
    getUserSessions(discordUserId) {
        const userSessions = this.data[discordUserId];
        if (!userSessions || Object.keys(userSessions).length === 0) return null;
        return { ...userSessions };
    }

    /**
     * Get a specific session for a user and Riot ID.
     */
    getSession(discordUserId, riotId) {
        return this.data[discordUserId]?.[riotId] || null;
    }

    /**
     * Add or update a session.
     */
    setSession(discordUserId, riotId, sessionData) {
        if (!this.data[discordUserId]) {
            this.data[discordUserId] = {};
        }
        this.data[discordUserId][riotId] = {
            ...sessionData,
            tokenExpiresAt: sessionData.tokenExpiresAt || (Date.now() + ValConfig.TokenLifetimeMs)
        };
        this.save();
    }

    /**
     * Remove a specific session.
     */
    removeSession(discordUserId, riotId) {
        if (this.data[discordUserId]) {
            delete this.data[discordUserId][riotId];
            if (Object.keys(this.data[discordUserId]).length === 0) {
                delete this.data[discordUserId];
            }
            this.save();
        }
    }

    /**
     * Remove all sessions for a Discord user.
     */
    removeAllSessions(discordUserId) {
        delete this.data[discordUserId];
        this.save();
    }

    /** @private */
    #encrypt(text) {
        if (!text) return text;
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.#encryptionKey, iv);
            let encrypted = cipher.update(text);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (e) {
            console.warn('[FileSessionRepository] Encryption error:', e.message);
            return text;
        }
    }

    /** @private */
    #decrypt(text) {
        try {
            if (!this.#encryptionKey || text.trim().startsWith('{')) return text; // Plaintext JSON fallback
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.#encryptionKey, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (e) {
            console.warn('[FileSessionRepository] Decryption error:', e.message);
            return text;
        }
    }
}

module.exports = FileSessionRepository;
