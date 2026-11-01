/**
 * OwnerUtils — Centralized utility class for bot ownership verification.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class OwnerUtils {
    /**
     * Checks if the given user ID matches any of the configured bot owners in process.env.OWNER_ID.
     * Supports comma-separated list of IDs with whitespace trimming.
     * Guaranteed to never match empty strings, null, or undefined.
     */
    static isOwner(userId?: string | null): boolean {
        if (!userId || typeof userId !== 'string') return false;
        const cleanId = userId.trim();
        if (!cleanId) return false;

        const raw = process.env.OWNER_ID;
        if (!raw || typeof raw !== 'string') return false;

        const ownerIds = raw
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

        return ownerIds.includes(cleanId);
    }
}

export default OwnerUtils;
