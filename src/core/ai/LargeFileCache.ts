/**
 * LargeFileCache — Per-channel ephemeral cache for large uploaded code/text files.
 *
 * When a user uploads a large file (e.g. 260 KB of Assembly), instead of forcing
 * the entire content into the AI's context window (which blows up token budget),
 * AIStreamHandler stores the file here and passes the AI only a lightweight outline.
 *
 * The AI can then call inspect_code() to read any specific line range on demand,
 * like a real engineer paging through a file rather than memorizing all of it at once.
 *
 * Design:
 *  - Keyed by (channelId, filename) so the same filename in different channels never collides.
 *  - Entries have a TTL (default 2 h) matching the conversation session TTL.
 *  - Lines are stored as a pre-split string array for O(1) line-range slicing.
 *  - A small LRU-style channel cap prevents unbounded memory growth.
 */

export interface CachedFile {
    filename: string;
    lines: string[]; // All lines of the file (1-indexed in the public API)
    totalLines: number;
    totalBytes: number;
    language: string; // Inferred from extension, e.g. "asm", "py"
    cachedAt: number; // Date.now() timestamp
    expiresAt: number;
}

export interface LargeFileCacheOptions {
    /** Bytes threshold above which a file is considered "large". Default: 40 * 1024 (40 KB). */
    largeFileThresholdBytes?: number;
    /** Time-to-live in ms for each cached file. Default: 2 h. */
    ttlMs?: number;
    /** Maximum number of channels that can be tracked simultaneously. Default: 200. */
    maxChannels?: number;
    /** Maximum files stored per channel. Default: 10. */
    maxFilesPerChannel?: number;
}

class LargeFileCache {
    readonly #threshold: number;
    readonly #ttlMs: number;
    readonly #maxChannels: number;
    readonly #maxFilesPerChannel: number;

    // channelId -> Map<filename, CachedFile>
    readonly #store = new Map<string, Map<string, CachedFile>>();

    constructor(options: LargeFileCacheOptions = {}) {
        this.#threshold = options.largeFileThresholdBytes ?? 40 * 1024;
        this.#ttlMs = options.ttlMs ?? 1000 * 60 * 60 * 2;
        this.#maxChannels = options.maxChannels ?? 200;
        this.#maxFilesPerChannel = options.maxFilesPerChannel ?? 10;
    }

    /** Byte threshold for "large file" detection. */
    get threshold(): number {
        return this.#threshold;
    }

    /**
     * Returns true if the given content is considered a "large file" that should be
     * stored in the cache rather than injected verbatim into the LLM context.
     */
    isLargeFile(content: string): boolean {
        return Buffer.byteLength(content, 'utf8') >= this.#threshold;
    }

    /**
     * Store a file in the cache for a given channel.
     * Replaces any existing entry with the same (channelId, filename).
     */
    store(channelId: string, filename: string, content: string, language?: string): CachedFile {
        this.#evictExpired();

        // Enforce channel cap by dropping the oldest channel if needed
        if (!this.#store.has(channelId) && this.#store.size >= this.#maxChannels) {
            const oldestKey = this.#store.keys().next().value;
            if (oldestKey) this.#store.delete(oldestKey);
        }

        if (!this.#store.has(channelId)) {
            this.#store.set(channelId, new Map());
        }

        const channelFiles = this.#store.get(channelId)!;

        // Enforce per-channel file cap
        if (!channelFiles.has(filename) && channelFiles.size >= this.#maxFilesPerChannel) {
            const oldestFilename = channelFiles.keys().next().value;
            if (oldestFilename) channelFiles.delete(oldestFilename);
        }

        const lines = content.split('\n');
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const entry: CachedFile = {
            filename,
            lines,
            totalLines: lines.length,
            totalBytes: Buffer.byteLength(content, 'utf8'),
            language: language || ext,
            cachedAt: Date.now(),
            expiresAt: Date.now() + this.#ttlMs
        };

        channelFiles.set(filename, entry);
        return entry;
    }

    /**
     * Retrieve a cached file entry.  Returns null if not found or expired.
     */
    get(channelId: string, filename: string): CachedFile | null {
        const channelFiles = this.#store.get(channelId);
        if (!channelFiles) return null;

        const entry = channelFiles.get(filename);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            channelFiles.delete(filename);
            return null;
        }

        return entry;
    }

    /**
     * Read a line range from a cached file.
     * startLine and endLine are 1-indexed and inclusive.
     * Returns null if the file is not in the cache.
     */
    readLines(channelId: string, filename: string, startLine: number, endLine: number): string[] | null {
        const entry = this.get(channelId, filename);
        if (!entry) return null;

        const s = Math.max(1, startLine) - 1; // Convert to 0-indexed
        const e = Math.min(entry.totalLines, endLine); // Inclusive, 1-indexed
        return entry.lines.slice(s, e);
    }

    /**
     * Returns a lightweight outline of the file:
     * - File info header (name, lines, size)
     * - First 40 lines (usually contains includes, .data section, entry point declaration)
     * - A list of meaningful labels/symbols (lines that end with ':', start with 'def ', 'fn ', etc.)
     * - Last 10 lines
     *
     * This is what gets sent to the AI when a large file is first uploaded, so the AI
     * understands the structure without consuming the full token budget.
     */
    buildOutline(channelId: string, filename: string): string | null {
        const entry = this.get(channelId, filename);
        if (!entry) return null;

        const { lines, totalLines, totalBytes, language } = entry;
        const sizeKb = (totalBytes / 1024).toFixed(1);
        const isPdf = language === 'pdf' || filename.toLowerCase().endsWith('.pdf');
        const typeLabel = isPdf ? '大型 PDF 文件' : '大型程式碼檔案';
        const langLabel = isPdf ? '格式: PDF' : `語言: ${language || '未知'}`;
        const codeLang = isPdf ? 'text' : language || 'text';

        const sections: string[] = [];
        sections.push(
            `【${typeLabel}：${filename}】\n` +
                `- ${langLabel} | 共 ${totalLines} 行 | ${sizeKb} KB\n` +
                `- 因檔案過大，以下僅提供架構大綱。如需查閱特定區段，請調用 \`inspect_code\` 工具指定行範圍。`
        );

        // Section A: first 40 lines
        const headCount = Math.min(40, totalLines);
        const head = lines.slice(0, headCount);
        sections.push(`\`\`\`${codeLang}\n# -- 前 ${headCount} 行 --\n${head.join('\n')}\n\`\`\``);

        // Section B: symbol/label index
        const symbols: { lineNo: number; text: string }[] = [];
        const symbolPatterns = [
            /^[A-Za-z_]\w*\s*:/, // Assembly labels: init_gdt:
            /^(global|section|segment)\s+/i, // Assembly directives
            /^\s*(def|class|async def)\s+\w+/, // Python functions/classes
            /^\s*(pub\s+)?(fn|async fn|impl|struct|enum|trait)\s+\w+/, // Rust
            /^\s*(func|fun|fun\s+suspend)\s+\w+/, // Go / Kotlin
            /^\s*(function|const|let|var)\s+\w+\s*[=(]/, // JS/TS
            /^\s*(public|private|protected|static|void|int|long)\s+\w+\s*\(/, // Java/C
            /^\s*(proc|macro|sub)\s+\w+/i // asm macros
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (symbolPatterns.some((p) => p.test(line))) {
                symbols.push({ lineNo: i + 1, text: line.trim().slice(0, 80) });
                if (symbols.length >= 60) break;
            }
        }

        if (symbols.length > 0) {
            const symbolList = symbols.map((s) => `L${s.lineNo.toString().padStart(5)}: ${s.text}`).join('\n');
            sections.push(
                `**符號 / 標籤索引（共 ${symbols.length} 個，截至前 60 個）：**\n\`\`\`\n${symbolList}\n\`\`\``
            );
        }

        // Section C: last 20 lines (if file is longer than head + tail overlap)
        if (totalLines > headCount + 20) {
            const tail = lines.slice(-20);
            sections.push(
                `\`\`\`${language}\n# -- 末尾 20 行 (L${totalLines - 19}~L${totalLines}) --\n${tail.join('\n')}\n\`\`\``
            );
        }

        sections.push(`> 如需查看特定區段，請直接說明或調用 \`inspect_code("${filename}", <起始行>, <結束行>)\`。`);

        return sections.join('\n\n');
    }

    /**
     * List all non-expired files currently cached for a channel.
     */
    listFiles(
        channelId: string
    ): Array<{ filename: string; totalLines: number; totalBytes: number; language: string }> {
        const channelFiles = this.#store.get(channelId);
        if (!channelFiles) return [];

        const now = Date.now();
        const result: Array<{ filename: string; totalLines: number; totalBytes: number; language: string }> = [];
        for (const [, entry] of channelFiles) {
            if (now <= entry.expiresAt) {
                result.push({
                    filename: entry.filename,
                    totalLines: entry.totalLines,
                    totalBytes: entry.totalBytes,
                    language: entry.language
                });
            }
        }
        return result;
    }

    /** Remove a specific file from the cache. */
    evict(channelId: string, filename: string): boolean {
        return Boolean(this.#store.get(channelId)?.delete(filename));
    }

    /** Clear all files for a channel (e.g. when the AI session is reset). */
    clearChannel(channelId: string): void {
        this.#store.delete(channelId);
    }

    /** Evict all expired entries across all channels. */
    #evictExpired(): void {
        const now = Date.now();
        for (const [channelId, channelFiles] of this.#store) {
            for (const [filename, entry] of channelFiles) {
                if (now > entry.expiresAt) channelFiles.delete(filename);
            }
            if (channelFiles.size === 0) this.#store.delete(channelId);
        }
    }

    /** Total number of channels currently tracked. */
    get channelCount(): number {
        return this.#store.size;
    }
}

export default LargeFileCache;
