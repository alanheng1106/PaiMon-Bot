/**
 * DiscordSanitizer — Sanitizes text outputs for safe Discord message delivery.
 * Cleans mass pings, LaTeX mathematical formatting, and unrendered Markdown tables.
 */
class DiscordSanitizer {
    /**
     * Sanitize raw text content.
     */
    static sanitize(text: string): string {
        if (!text || typeof text !== 'string') return '';

        let cleaned = text.trim();

        // 1. Prevent @everyone or @here mass mention exploits
        cleaned = cleaned.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');

        // 2. Clean LaTeX math environments and symbols
        cleaned = DiscordSanitizer.sanitizeLaTeX(cleaned);

        // 3. Convert Markdown tables to codeblocks for clean Discord rendering
        cleaned = DiscordSanitizer.sanitizeMarkdownTables(cleaned);

        // 4. Sanitize unsupported Discord Markdown headings (####+ -> ###)
        cleaned = DiscordSanitizer.sanitizeHeadings(cleaned);

        // 5. Convert AI time tags to Discord dynamic timestamps (<time:...> -> <t:...>)
        cleaned = DiscordSanitizer.sanitizeTimestamps(cleaned);

        // 6. Strip leaked model protocol tags (DeepSeek DSML, tool markers)
        cleaned = DiscordSanitizer.sanitizeModelMarkup(cleaned);

        return cleaned;
    }

    /**
     * Strips leaked model protocol tags such as DeepSeek DSML tags or tool boundaries.
     */
    static sanitizeModelMarkup(text: string): string {
        if (!text) return '';
        return text
            .replace(/<\/?[|｜]{1,2}DSML[|｜]{1,2}[^>]*>/gi, '')
            .replace(
                /<[|｜]{1,2}(?:tool calls begin|tool calls end|tool call begin|tool call end|tool sep)[|｜]{1,2}>/gi,
                ''
            )
            .trim();
    }

    static readonly #LATEX_SYMBOLS: Record<string, string> = {
        // Greek Lowercase
        alpha: 'α',
        beta: 'β',
        gamma: 'γ',
        delta: 'δ',
        epsilon: 'ε',
        varepsilon: 'ε',
        zeta: 'ζ',
        eta: 'η',
        theta: 'θ',
        vartheta: 'ϑ',
        iota: 'ι',
        kappa: 'κ',
        varkappa: 'ϰ',
        lambda: 'λ',
        mu: 'μ',
        nu: 'ν',
        xi: 'ξ',
        pi: 'π',
        varpi: 'ϖ',
        rho: 'ρ',
        varrho: 'ϱ',
        sigma: 'σ',
        varsigma: 'ς',
        tau: 'τ',
        upsilon: 'υ',
        phi: 'φ',
        varphi: 'ϕ',
        chi: 'χ',
        psi: 'ψ',
        omega: 'ω',

        // Greek Uppercase
        Gamma: 'Γ',
        Delta: 'Δ',
        Theta: 'Θ',
        Lambda: 'Λ',
        Xi: 'Ξ',
        Pi: 'Π',
        Sigma: 'Σ',
        Upsilon: 'Υ',
        Phi: 'Φ',
        Psi: 'Ψ',
        Omega: 'Ω',

        // Blackboard Bold (Number sets)
        'mathbb{N}': 'ℕ',
        'mathbb{Z}': 'ℤ',
        'mathbb{Q}': 'ℚ',
        'mathbb{R}': 'ℝ',
        'mathbb{C}': 'ℂ',
        'mathbb{P}': 'ℙ',
        'mathbb{H}': 'ℍ',

        // Binary Operators
        pm: '±',
        mp: '∓',
        times: '×',
        div: '÷',
        ast: '*',
        star: '⋆',
        circ: '∘',
        bullet: '•',
        cdot: '·',
        cap: '∩',
        cup: '∪',
        uplus: '⊎',
        sqcap: '⊓',
        sqcup: '⊔',
        vee: '∨',
        lor: '∨',
        wedge: '∧',
        land: '∧',
        setminus: '\\',
        wr: '≀',
        diamond: '⋄',
        bigtriangleup: '△',
        bigtriangledown: '▽',
        triangleleft: '◃',
        triangleright: '▹',
        oplus: '⊕',
        ominus: '⊖',
        otimes: '⊗',
        oslash: '⊘',
        odot: '⊙',
        bigcirc: '◯',
        dagger: '†',
        ddagger: '‡',
        amalg: '⨿',

        // Relation Operators
        leq: '≤',
        le: '≤',
        geq: '≥',
        ge: '≥',
        neq: '≠',
        ne: '≠',
        equiv: '≡',
        ll: '≪',
        gg: '≫',
        doteq: '≐',
        sim: '∼',
        simeq: '≃',
        approx: '≈',
        cong: '≅',
        asymp: '≍',
        bowtie: '⋈',
        propto: '∝',
        models: '⊨',
        prec: '≺',
        succ: '≻',
        preceq: '⪯',
        succeq: '⪰',
        parallel: '∥',
        perp: '⊥',
        mid: '|',
        nmid: '∤',
        in: '∈',
        notin: '∉',
        ni: '∋',
        owns: '∋',
        subset: '⊂',
        supset: '⊃',
        subseteq: '⊆',
        supseteq: '⊇',
        sqsubset: '⊏',
        sqsupset: '⊐',
        sqsubseteq: '⊑',
        sqsupseteq: '⊒',
        smile: '⌣',
        frown: '⌢',
        vdash: '⊢',
        dashv: '⊣',

        // Negated Binary Relations
        nless: '≮',
        ngtr: '≯',
        nleq: '≰',
        ngeq: '≱',
        nsubseteq: '⊈',
        nsupseteq: '⊉',

        // Arrows
        leftarrow: '←',
        gets: '←',
        rightarrow: '→',
        to: '→',
        leftrightarrow: '↔',
        Leftarrow: '⇐',
        Rightarrow: '⇒',
        Leftrightarrow: '⇔',
        iff: '⇔',
        mapsto: '↦',
        hookleftarrow: '↩',
        hookrightarrow: '↪',
        leftharpoonup: '↼',
        leftharpoondown: '↽',
        rightharpoonup: '⇀',
        rightharpoondown: '⇁',
        rightleftharpoons: '⇌',
        uparrow: '↑',
        downarrow: '↓',
        updownarrow: '↕',
        Uparrow: '⇑',
        Downarrow: '⇓',
        Updownarrow: '⇕',
        nearrow: '↗',
        searrow: '↘',
        swarrow: '↙',
        nwarrow: '↖',

        // Large Operators
        sum: '∑',
        prod: '∏',
        coprod: '∐',
        int: '∫',
        oint: '∮',
        iint: '∬',
        iiint: '∭',
        bigcap: '⋂',
        bigcup: '⋃',
        bigodot: '⨀',
        bigoplus: '⨁',
        bigotimes: '⨂',
        bigsqcup: '⨆',
        biguplus: '⨄',
        bigvee: '⋁',
        bigwedge: '⋀',

        // Delimiters
        langle: '⟨',
        rangle: '⟩',
        lceil: '⌈',
        rceil: '⌉',
        lfloor: '⌊',
        rfloor: '⌋',
        lbrace: '{',
        rbrace: '}',
        vert: '|',
        Vert: '‖',

        // Other Symbols
        infty: '∞',
        nabla: '∇',
        partial: '∂',
        exists: '∃',
        nexists: '∄',
        forall: '∀',
        neg: '¬',
        lnot: '¬',
        emptyset: '∅',
        varnothing: '∅',
        aleph: 'ℵ',
        hbar: 'ℏ',
        ell: 'ℓ',
        wp: '℘',
        Re: 'ℜ',
        Im: 'ℑ',
        top: '⊤',
        bot: '⊥',
        angle: '∠',
        triangle: '△',
        backslash: '\\',
        prime: '′',
        surd: '√',
        degree: '°'
    };

    static readonly #SORTED_LATEX_KEYS: string[] = Object.keys(DiscordSanitizer.#LATEX_SYMBOLS).sort(
        (a, b) => b.length - a.length
    );

    /**
     * Clean LaTeX tags and convert common LaTeX math symbols to Unicode.
     * Unwraps LaTeX delimiters ($...$ and $$...$$) and transforms fractions, roots, and arrows.
     */
    static sanitizeLaTeX(text: string): string {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;

        // 1. Protect Code Blocks (both triple and single backticks)
        const codePlaceholders: { id: string; text: string }[] = [];
        cleaned = cleaned.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
            const id = `___CODE_BLOCK_${codePlaceholders.length}___`;
            codePlaceholders.push({ id, text: match });
            return id;
        });

        // 2. Protect Windows File Paths (e.g. C:\Users\FSOS\file.ts or .\src\index.ts)
        const pathPlaceholders: { id: string; text: string }[] = [];
        cleaned = cleaned.replace(/(?:[a-zA-Z]:\\|\.\\|\.\.\\)[\w.-]+(?:\\[\w.-]+)*/g, (match) => {
            const id = `___WIN_PATH_${pathPlaceholders.length}___`;
            pathPlaceholders.push({ id, text: match });
            return id;
        });

        // 3. Remove LaTeX environment tags \begin{...} and \end{...}
        cleaned = cleaned.replace(/\\begin\{[^{}]*\}/gi, '');
        cleaned = cleaned.replace(/\\end\{[^{}]*\}/gi, '');

        // 4. Remove \boxed{content} -> content
        cleaned = cleaned.replace(/\\boxed\{([^{}]+)\}/g, '$1');

        // 5. Remove formatting wrappers like \text{...}, \mathrm{...}, \mathbf{...}
        cleaned = cleaned.replace(
            /\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|boldsymbol|textbf|textit|operatorname)\{([^{}]+)\}/g,
            '$1'
        );

        // 6. Fractions & Binomials: \frac{a}{b}, \dfrac{a}{b}, \cfrac{a}{b} -> (a / b)
        while (/\\(?:frac|dfrac|cfrac|tfrac)\{([^{}]+)\}\{([^{}]+)\}/.test(cleaned)) {
            cleaned = cleaned.replace(/\\(?:frac|dfrac|cfrac|tfrac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
        }
        while (/\\(?:binom|dbinom|tbinom)\{([^{}]+)\}\{([^{}]+)\}/.test(cleaned)) {
            cleaned = cleaned.replace(/\\(?:binom|dbinom|tbinom)\{([^{}]+)\}\{([^{}]+)\}/g, 'C($1, $2)');
        }

        // 7. Roots: \sqrt[n]{x} -> n√(x), \sqrt{x} -> √(x)
        cleaned = cleaned.replace(/\\sqrt\[([^{}\]]+)\]\{([^{}]+)\}/g, '$1√($2)');
        cleaned = cleaned.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');

        // 8. Predefined LaTeX symbols map (all 200+ OEIS / AMS symbols)
        for (const key of DiscordSanitizer.#SORTED_LATEX_KEYS) {
            const unicodeChar = DiscordSanitizer.#LATEX_SYMBOLS[key];
            const escaped = key.replace(/[{}]/g, '\\$&');
            const regex = new RegExp(`\\\\${escaped}(?![a-zA-Z])`, 'g');
            cleaned = cleaned.replace(regex, unicodeChar);
        }

        // 9. Standard mathematical functions: strip backslash (\sin -> sin, \log -> log, etc.)
        cleaned = cleaned.replace(
            /\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|lg|exp|lim|max|min|sup|inf|det|dim|gcd|ker|deg|arg|hom|Pr)(?![a-zA-Z])/gi,
            '$1'
        );

        // 10. Sizing and spacing commands
        cleaned = cleaned.replace(
            /\\(left|right|limits|nolimits|displaystyle|textstyle|scriptstyle|scriptscriptstyle)(?![a-zA-Z])/g,
            ''
        );
        cleaned = cleaned.replace(/\\(quad|qquad|\s|;|:|,|!)/g, ' ');

        // 11. Generic recursive unwrapper for any remaining \command{content}
        while (/\\([a-zA-Z]+)\{([^{}]+)\}/.test(cleaned)) {
            cleaned = cleaned.replace(/\\([a-zA-Z]+)\{([^{}]+)\}/g, '$2');
        }

        // 12. Fallback inside math blocks: strip any remaining \command tokens
        cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
            return inner.replace(/\\([a-zA-Z]+)/g, '$1').trim();
        });
        cleaned = cleaned.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_match, inner) => {
            return inner.replace(/\\([a-zA-Z]+)/g, '$1').trim();
        });

        // 13. Protect currency ranges (e.g., $10 - $20, $50 ~ $100)
        const currencyPlaceholders: { id: string; text: string }[] = [];
        cleaned = cleaned.replace(/\$\s*\d+(?:\.\d+)?\s*(?:[-~–—至到/]|to)\s*\$\s*\d+(?:\.\d+)?/gi, (match) => {
            const id = `___CURR_RANGE_${currencyPlaceholders.length}___`;
            currencyPlaceholders.push({ id, text: match });
            return id;
        });

        // 14. Unwrap paired inline math $ ... $
        cleaned = cleaned.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_match, inner) => inner.trim());

        // 15. Restore currency ranges
        for (const { id, text: orig } of currencyPlaceholders) {
            cleaned = cleaned.replace(id, orig);
        }

        // 16. Restore Windows file paths
        for (const { id, text: orig } of pathPlaceholders) {
            cleaned = cleaned.replace(id, orig);
        }

        // 17. Restore Code Blocks
        for (const { id, text: orig } of codePlaceholders) {
            cleaned = cleaned.replace(id, orig);
        }

        return cleaned;
    }

    /**
     * Converts unrendered Markdown tables into clean Discord bulleted lists.
     * Code blocks (``` and `) are protected so example tables in code snippets are untouched.
     */
    static sanitizeMarkdownTables(text: string): string {
        if (!text || !text.includes('|')) return text;

        // 1. Protect code blocks (both triple and single backticks)
        const codePlaceholders: { id: string; text: string }[] = [];
        let cleaned = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
            const id = `___TABLE_CODE_${codePlaceholders.length}___`;
            codePlaceholders.push({ id, text: match });
            return id;
        });

        // 2. Match Markdown table pattern: header row with |, separator row with |:?-+:?|, followed by data rows
        const tableRegex = /(^\|[^\n]+\|\r?\n\|[\s:-|-]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/gm;

        cleaned = cleaned.replace(tableRegex, (match) => {
            return DiscordSanitizer.tableToBulletList(match);
        });

        // 3. Restore code blocks
        for (const { id, text: orig } of codePlaceholders) {
            cleaned = cleaned.replace(id, orig);
        }

        return cleaned;
    }

    /**
     * Converts a raw Markdown table string into a clean, human-readable Discord bullet list.
     */
    static tableToBulletList(tableMarkdown: string): string {
        const lines = tableMarkdown
            .trim()
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.startsWith('|') && l.length > 1);

        if (lines.length < 2) return tableMarkdown;

        const parseRow = (line: string): string[] => {
            return line
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((cell) => cell.trim());
        };

        const isSeparator = (line: string): boolean => {
            const raw = line.replace(/\|/g, '').trim();
            return /^[\s:-]+$/.test(raw);
        };

        const headerLine = lines[0];
        const headers = parseRow(headerLine);

        // Filter out separator lines to obtain clean data rows
        const dataLines = lines.slice(1).filter((l) => !isSeparator(l));
        if (dataLines.length === 0) return tableMarkdown;

        const listItems: string[] = [];

        for (const dataLine of dataLines) {
            const cells = parseRow(dataLine);
            if (cells.length === 0 || cells.every((c) => !c)) continue;

            const primaryKey = cells[0] || '';
            const remainingCells = cells.slice(1);

            if (headers.length <= 2) {
                // 2-column key-value format: - **Key**：Value
                const val = remainingCells[0] || '';
                listItems.push(val ? `- **${primaryKey}**：${val}` : `- **${primaryKey}**`);
            } else {
                // Multi-column format: - **Entity**：Header2: Val2 ｜ Header3: Val3
                const attributes: string[] = [];
                for (let i = 0; i < remainingCells.length; i++) {
                    const header = headers[i + 1] || '';
                    const val = remainingCells[i] || '';
                    if (!val) continue;

                    if (header) {
                        attributes.push(`${header}: ${val}`);
                    } else {
                        attributes.push(val);
                    }
                }

                if (attributes.length > 0) {
                    listItems.push(`- **${primaryKey}**：${attributes.join(' ｜ ')}`);
                } else {
                    listItems.push(`- **${primaryKey}**`);
                }
            }
        }

        if (listItems.length === 0) return tableMarkdown;

        return '\n' + listItems.join('\n') + '\n';
    }

    /**
     * Sanitizes unsupported Discord heading levels (#### to ######).
     * Discord only supports #, ##, and ###. Any 4+ hashes at the start of a line are converted to ###.
     * Code blocks (``` and `) are protected so programming comments are preserved.
     */
    static sanitizeHeadings(text: string): string {
        if (!text || !text.includes('####')) return text;

        // Protect code blocks (both triple and single backticks)
        const codePlaceholders: { id: string; text: string }[] = [];
        let cleaned = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
            const id = `___HEADING_CODE_${codePlaceholders.length}___`;
            codePlaceholders.push({ id, text: match });
            return id;
        });

        // Convert any line starting with 4 or more # followed by space to 3 # (Discord's max supported heading level)
        cleaned = cleaned.replace(/^(#{4,})\s+/gm, '### ');

        // Restore code blocks
        for (const { id, text: orig } of codePlaceholders) {
            cleaned = cleaned.replace(id, orig);
        }

        return cleaned;
    }

    /**
     * Converts AI generated time tags (<time:...> or pseudo Discord <t:...> with date strings)
     * into Discord native dynamic timestamps (<t:epoch:style>).
     * Supports formats like:
     * - <t:2026-10-27 00:00:00:R> or <time:2026-10-27 00:00:00:R>
     * - <t:2026-10-27 00:00:00|R> or <time:2026-10-27 00:00:00|R>
     * - <t:2026-10-27 00:00:00> or <time:2026-10-27 00:00:00>
     * - <t:2026-10-27:D> or <time:2026-10-27:D> (date-only anchored to local midnight)
     * - <t:1790148600:R> (raw epoch seconds or milliseconds)
     * Protects single and multi-line codeblocks so code samples are not altered.
     */
    static sanitizeTimestamps(text: string): string {
        if (!text || (!text.toLowerCase().includes('<time:') && !text.toLowerCase().includes('<t:'))) return text;

        // 1. Protect code blocks (both triple and single backticks)
        const codePlaceholders: { id: string; text: string }[] = [];
        let cleaned = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
            const id = `___TIME_CODE_${codePlaceholders.length}___`;
            codePlaceholders.push({ id, text: match });
            return id;
        });

        // 2. Replace <time:...> and <t:...> tags
        cleaned = cleaned.replace(/<(?:time|t):\s*([\s\S]+?)\s*>/gi, (match, rawInner) => {
            const inner = rawInner.trim();
            let datePart = inner;
            let stylePart = '';

            // Extract optional trailing style flag separated by ':' or '|'
            // Discord styles: t, T, d, D, f, F, R
            const styleMatch = inner.match(/^([\s\S]+?)[:|]([tTdDfFR])$/);
            if (styleMatch) {
                datePart = styleMatch[1].trim();
                stylePart = styleMatch[2];
            }

            // Case A: Raw numeric unix timestamp (9-12 digit seconds or 13-digit milliseconds)
            if (/^\d{9,12}$/.test(datePart)) {
                const unixSec = parseInt(datePart, 10);
                return stylePart ? `<t:${unixSec}:${stylePart}>` : `<t:${unixSec}>`;
            }
            if (/^\d{13}$/.test(datePart)) {
                const unixSec = Math.floor(parseInt(datePart, 10) / 1000);
                return stylePart ? `<t:${unixSec}:${stylePart}>` : `<t:${unixSec}>`;
            }

            // Case B: Date/Time string
            // Normalize Chinese date format: 2026年10月27日 -> 2026/10/27
            let dateToParse = datePart.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日?/g, '$1/$2/$3');

            // Normalize date-only format (YYYY-MM-DD or YYYY/MM/DD) to avoid UTC midnight shift in JS Date
            if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(dateToParse)) {
                dateToParse = `${dateToParse.replace(/-/g, '/')} 00:00:00`;
            }

            const parsedDate = new Date(dateToParse);
            if (isNaN(parsedDate.getTime())) {
                // Graceful fallback: return inner content without the wrapper if from <time:>, or original match if from <t:>
                return match.toLowerCase().startsWith('<time:') ? datePart : match;
            }

            const unixSec = Math.floor(parsedDate.getTime() / 1000);
            return stylePart ? `<t:${unixSec}:${stylePart}>` : `<t:${unixSec}>`;
        });

        // 3. Restore code blocks
        for (const { id, text: orig } of codePlaceholders) {
            cleaned = cleaned.replace(id, () => orig);
        }

        return cleaned;
    }

    /**
     * Escape special regex characters in a string.
     */
    static escapeRegExp(string: string): string {
        if (!string || typeof string !== 'string') return '';
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export default DiscordSanitizer;
