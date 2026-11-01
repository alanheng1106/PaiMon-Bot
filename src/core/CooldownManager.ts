/**
 * Per-user, per-command cooldown manager.
 * Lazy expiration cleanup without accumulating setTimeout handles.
 */
class CooldownManager {
    #cooldowns = new Map<string, Map<string, number>>();

    /**
     * Check if a user is on cooldown for a command.
     * If not, registers the new cooldown and returns null.
     * If yes, returns the remaining seconds as a string.
     *
     * @param commandName
     * @param userId
     * @param cooldownSeconds
     * @returns remaining seconds string, or null if no cooldown active
     */
    check(commandName: string, userId: string, cooldownSeconds?: number): string | null {
        if (!cooldownSeconds || cooldownSeconds <= 0) return null;

        if (!this.#cooldowns.has(commandName)) {
            this.#cooldowns.set(commandName, new Map());
        }

        const timestamps = this.#cooldowns.get(commandName)!;
        const now = Date.now();

        for (const [uid, exp] of timestamps) {
            if (now >= exp) timestamps.delete(uid);
        }

        const expireTime = timestamps.get(userId);

        if (expireTime && now < expireTime) {
            return ((expireTime - now) / 1000).toFixed(1);
        }

        // Register cooldown, lazy clean-up on future checks
        timestamps.set(userId, now + cooldownSeconds * 1000);
        return null;
    }
}

export default CooldownManager;
