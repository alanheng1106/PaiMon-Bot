/**
 * DiscordSanitizer — Sanitizes text outputs for safe Discord message delivery.
 * Refactored for clean SRP and Utility helper functions.
 */
class DiscordSanitizer {
    /**
     * Sanitize raw text content.
     * @param {string} text 
     * @returns {string} Cleaned text
     */
    static sanitize(text) {
        if (!text || typeof text !== 'string') return '';
        
        // Trim leading/trailing whitespace
        let cleaned = text.trim();

        // Prevent @everyone or @here mass mention exploits
        cleaned = cleaned.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');

        return cleaned;
    }
    /**
     * Escape special regex characters in a string.
     * @param {string} string 
     * @returns {string} Escaped string
     */
    static escapeRegExp(string) {
        if (!string || typeof string !== 'string') return '';
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = DiscordSanitizer;
