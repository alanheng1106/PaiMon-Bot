/**
 * DiscordSanitizer — Sanitizes text outputs for safe Discord message delivery.
 * Cleans mass pings, LaTeX mathematical formatting, and unrendered Markdown tables.
 */
class DiscordSanitizer {
    /**
     * Sanitize raw text content.
     * @param {string} text 
     * @returns {string} Cleaned text
     */
    static sanitize(text) {
        if (!text || typeof text !== 'string') return '';
        
        let cleaned = text.trim();

        // 1. Prevent @everyone or @here mass mention exploits
        cleaned = cleaned.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');

        // 2. Clean LaTeX math environments and symbols
        cleaned = DiscordSanitizer.sanitizeLaTeX(cleaned);

        // 3. Convert Markdown tables to codeblocks for clean Discord rendering
        cleaned = DiscordSanitizer.sanitizeMarkdownTables(cleaned);

        return cleaned;
    }

    /**
     * Clean LaTeX tags and convert common LaTeX math symbols to Unicode.
     * @param {string} text 
     * @returns {string}
     */
    static sanitizeLaTeX(text) {
        if (!text) return '';
        let cleaned = text;

        // Remove LaTeX environment tags \begin{...} and \end{...}
        cleaned = cleaned.replace(/\\begin\{[^{}]*\}/gi, '');
        cleaned = cleaned.replace(/\\end\{[^{}]*\}/gi, '');
        
        // Remove \boxed{content} -> content
        cleaned = cleaned.replace(/\\boxed\{([^{}]+)\}/g, '$1');

        // Common LaTeX math symbols to Unicode replacement map
        const latexMap = [
            [/\\subseteq/g, '⊆'],
            [/\\circ/g, '∘'],
            [/\\in/g, '∈'],
            [/\\notin/g, '∉'],
            [/\\land/g, '∧'],
            [/\\lor/g, '∨'],
            [/\\exists/g, '∃'],
            [/\\forall/g, '∀'],
            [/\\times/g, '×'],
            [/\\cap/g, '∩'],
            [/\\cup/g, '∪'],
            [/\\neq/g, '≠'],
            [/\\leq/g, '≤'],
            [/\\geq/g, '≥'],
            [/\\approx/g, '≈'],
            [/\\to/g, '→'],
            [/\\rightarrow/g, '→'],
            [/\\Rightarrow/g, '⇒'],
            [/\\cdot/g, '·'],
            [/\\ldots/g, '...'],
            [/\\quad/g, ' '],
            [/\\qquad/g, '  '],
            [/\\;/g, ' '],
            [/\\,/g, ' '],
            [/\\text\{([^{}]+)\}/g, '$1'],
            [/\\\[\d+pt\]/g, '\n']
        ];

        for (const [regex, replacement] of latexMap) {
            cleaned = cleaned.replace(regex, replacement);
        }

        return cleaned;
    }

    /**
     * Wrap raw Markdown tables into monospaced codeblocks so Discord renders them with proper alignment.
     * @param {string} text 
     * @returns {string}
     */
    static sanitizeMarkdownTables(text) {
        if (!text) return '';
        
        // Match table pattern: line starting with '|', followed by '|---|' separator line, followed by rows
        const tableRegex = /(^\|[^\n]+\|\r?\n\|[\s:-|-]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/gm;
        
        return text.replace(tableRegex, (match) => {
            // Check if already inside a codeblock
            return '\n```\n' + match.trim() + '\n```\n';
        });
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
