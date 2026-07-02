/**
 * Per-user, per-command cooldown manager.
 * Automatically cleans up expired entries.
 */
class CooldownManager {
    constructor() {
        // Map<commandName, Map<userId, expireTimestamp>>
        this.cooldowns = new Map();
    }

    /**
     * Check if a user is on cooldown for a command.
     * If not, registers the new cooldown and returns null.
     * If yes, returns the remaining seconds as a string.
     *
     * @param {string} commandName
     * @param {string} userId
     * @param {number} cooldownSeconds
     * @returns {string|null} remaining seconds string, or null if no cooldown active
     */
    check(commandName, userId, cooldownSeconds) {
        if (!cooldownSeconds || cooldownSeconds <= 0) return null;

        if (!this.cooldowns.has(commandName)) {
            this.cooldowns.set(commandName, new Map());
        }

        const timestamps = this.cooldowns.get(commandName);
        const now = Date.now();
        const expireTime = timestamps.get(userId);

        if (expireTime && now < expireTime) {
            return ((expireTime - now) / 1000).toFixed(1);
        }

        // Register cooldown, auto-cleanup after it expires
        timestamps.set(userId, now + cooldownSeconds * 1000);
        setTimeout(() => timestamps.delete(userId), cooldownSeconds * 1000);
        return null;
    }
}

module.exports = CooldownManager;
