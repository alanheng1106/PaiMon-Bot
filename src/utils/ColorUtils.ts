/**
 * ColorUtils — Centralized utility class for hex color transformations and integer conversions.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class ColorUtils {
    /**
     * Darken or lighten a hex color string.
     * @param color - Hex color string (with or without '#')
     * @param amount - Amount to add to RGB channels (-255 to +255)
     * @returns Adjusted hex color string
     */
    static adjustColor(color: string, amount: number): string {
        if (!color || typeof color !== 'string') return '#888888';

        let usePound = false;
        let c = color;
        if (c[0] === '#') {
            c = c.slice(1);
            usePound = true;
        }
        const num = parseInt(c, 16);
        if (isNaN(num)) return usePound ? '#888888' : '888888';

        let r = (num >> 16) + amount;
        if (r > 255) r = 255;
        else if (r < 0) r = 0;

        let g = ((num >> 8) & 0x00ff) + amount;
        if (g > 255) g = 255;
        else if (g < 0) g = 0;

        let b = (num & 0x0000ff) + amount;
        if (b > 255) b = 255;
        else if (b < 0) b = 0;

        return (usePound ? '#' : '') + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    /**
     * Safely parse a hex color string into a decimal integer.
     */
    static hexToInt(hexStr: string, fallback: number = 0): number {
        if (!hexStr || typeof hexStr !== 'string') return fallback;
        const cleaned = hexStr.startsWith('#') ? hexStr.slice(1) : hexStr;
        const parsed = parseInt(cleaned, 16);
        return isNaN(parsed) ? fallback : parsed;
    }

    /**
     * Normalize hex color string to contain leading '#' prefix.
     */
    static normalizeHex(hexStr: string, fallback: string = '#888888'): string {
        if (!hexStr || typeof hexStr !== 'string') return fallback;
        const cleaned = hexStr.trim();
        if (cleaned.startsWith('#')) return cleaned;
        return `#${cleaned}`;
    }
}

export default ColorUtils;
