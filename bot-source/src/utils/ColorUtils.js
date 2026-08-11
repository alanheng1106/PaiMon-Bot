/**
 * ColorUtils — Centralized utility class for hex color transformations and integer conversions.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class ColorUtils {
    /**
     * Darken or lighten a hex color string.
     * @param {string} color - Hex color string (with or without '#')
     * @param {number} amount - Amount to add to RGB channels (-255 to +255)
     * @returns {string} Adjusted hex color string
     */
    static adjustColor(color, amount) {
        if (!color || typeof color !== 'string') return '#888888';

        let usePound = false;
        if (color[0] === '#') {
            color = color.slice(1);
            usePound = true;
        }
        let num = parseInt(color, 16);
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
     * @param {string} hexStr 
     * @param {number} [fallback=0] 
     * @returns {number}
     */
    static hexToInt(hexStr, fallback = 0) {
        if (!hexStr || typeof hexStr !== 'string') return fallback;
        const cleaned = hexStr.startsWith('#') ? hexStr.slice(1) : hexStr;
        const parsed = parseInt(cleaned, 16);
        return isNaN(parsed) ? fallback : parsed;
    }

    /**
     * Normalize hex color string to contain leading '#' prefix.
     * @param {string} hexStr 
     * @param {string} [fallback='#888888'] 
     * @returns {string}
     */
    static normalizeHex(hexStr, fallback = '#888888') {
        if (!hexStr || typeof hexStr !== 'string') return fallback;
        const cleaned = hexStr.trim();
        if (cleaned.startsWith('#')) return cleaned;
        return `#${cleaned}`;
    }
}

module.exports = ColorUtils;
