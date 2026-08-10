const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Valorant: ValConfig } = require('../../config');

/**
 * FileSessionRepository — Manages persistence and encryption for Valorant sessions.
 * Refactored for clean OOP / SOLID compliance (SRP & Encapsulation).
 */
class FileSessionRepository {
    #dataDir;
    #filePath;
    #encryptionKey;
    #sessions = {};
    #debounceTimer = null;

    constructor(dataDir = null, filePath = null, encryptionSource = null) {
        this.#dataDir = dataDir || path.join(__dirname, '..', '..', '..', 'data');
        this.#filePath = filePath || path.join(this.#dataDir, 'val-sessions.json');
        
        const source = encryptionSource || process.env.ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'no-key-configured';
        this.#encryptionKey = crypto.createHash('sha256').update(String(source)).digest();
        this.load();
    }

    /**
     * Load encrypted session file from disk into memory.
     */
    load() {
        try {
            if (!fs.existsSync(this.#dataDir)) {
                fs.mkdirSync(this.#dataDir, { recursive: true });
            }
            if (fs.existsSync(this.#filePath)) {
                const encryptedData = fs.readFileSync(this.#filePath, 'utf8');
                if (encryptedData.trim()) {
                    const decryptedData = this.#decrypt(encryptedData);
                    this.#sessions = JSON.parse(decryptedData);
                }
            }
        } catch (err) {
            console.error('[FileSessionRepository] Failed to load sessions:', err.message);
            this.#sessions = {};
        }
    }

    /**
     * Save sessions to disk with debounce timer.
     */
    save() {
        clearTimeout(this.#debounceTimer);
        this.#debounceTimer = setTimeout(() => {
            this.flush();
        }, ValConfig.SaveDebounceMs || 1000);
    }

    /**
     * Immediately write sessions to disk.
     */
    flush() {
        clearTimeout(this.#debounceTimer);
        try {
            if (!fs.existsSync(this.#dataDir)) {
                fs.mkdirSync(this.#dataDir, { recursive: true });
            }
            const rawData = JSON.stringify(this.#sessions, null, 2);
            const encryptedData = this.#encrypt(rawData);
            fs.writeFileSync(this.#filePath, encryptedData, 'utf8');
        } catch (err) {
            console.error('[FileSessionRepository] Failed to save sessions:', err.message);
        }
    }

    /**
     * Get all sessions for a Discord user.
     * @param {string} discordUserId 
     * @returns {Object|null} Map of riotId -> sessionData or null
     */
    getUserSessions(discordUserId) {
        const userSessions = this.#sessions[discordUserId];
        if (!userSessions || Object.keys(userSessions).length === 0) return null;
        return { ...userSessions };
    }

    /**
     * Get a specific session for a user and Riot ID.
     */
    getSession(discordUserId, riotId) {
        return this.#sessions[discordUserId]?.[riotId] || null;
    }

    /**
     * Add or update a session.
     */
    setSession(discordUserId, riotId, sessionData) {
        if (!this.#sessions[discordUserId]) {
            this.#sessions[discordUserId] = {};
        }
        this.#sessions[discordUserId][riotId] = {
            ...sessionData,
            tokenExpiresAt: sessionData.tokenExpiresAt || (Date.now() + ValConfig.TokenLifetimeMs)
        };
        this.save();
    }

    /**
     * Remove a specific session.
     */
    removeSession(discordUserId, riotId) {
        if (this.#sessions[discordUserId]) {
            delete this.#sessions[discordUserId][riotId];
            if (Object.keys(this.#sessions[discordUserId]).length === 0) {
                delete this.#sessions[discordUserId];
            }
            this.save();
        }
    }

    /**
     * Remove all sessions for a Discord user.
     */
    removeAllSessions(discordUserId) {
        delete this.#sessions[discordUserId];
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
            return text;
        }
    }

    /** @private */
    #decrypt(text) {
        if (text.trim().startsWith('{')) return text; // Plaintext JSON fallback
        try {
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.#encryptionKey, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (e) {
            throw new Error('Decryption failed, invalid key or corrupted data');
        }
    }
}

module.exports = FileSessionRepository;
