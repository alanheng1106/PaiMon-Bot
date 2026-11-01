/**
 * ColorUtils — Centralized utility class for hex color transformations and integer conversions.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class ColorUtils {
    /**
     * Safely parse a hex color string or return an integer color value.
     */
    static hexToInt(hexStr?: string | number | null, fallback: number = 0): number {
        if (hexStr === undefined || hexStr === null) return fallback;
        if (typeof hexStr === 'number') return isNaN(hexStr) ? fallback : hexStr;
        if (typeof hexStr !== 'string') return fallback;
        const cleaned = hexStr.startsWith('#') ? hexStr.slice(1) : hexStr;
        const parsed = parseInt(cleaned, 16);
        return isNaN(parsed) ? fallback : parsed;
    }
}

export default ColorUtils;
