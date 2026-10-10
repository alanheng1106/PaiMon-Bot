import fs from 'fs';

/**
 * BaseJsonFileStore — Abstract base class for debounced JSON file persistence.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class BaseJsonFileStore<T extends Record<string, any> = Record<string, any>> {
    #dataDir: string;
    #filePath: string;
    #debounceMs: number;
    #debounceTimer: NodeJS.Timeout | null = null;
    #data: T = {} as T;

    constructor(dataDir: string, filePath: string, debounceMs: number = 500) {
        this.#dataDir = dataDir;
        this.#filePath = filePath;
        this.#debounceMs = debounceMs;
        this.load();
    }

    get dataDir(): string {
        return this.#dataDir;
    }

    set dataDir(val: string) {
        this.#dataDir = val;
    }

    get filePath(): string {
        return this.#filePath;
    }

    set filePath(val: string) {
        this.#filePath = val;
    }

    get _debounceTimer(): NodeJS.Timeout | null {
        return this.#debounceTimer;
    }

    get data(): T {
        return this.#data;
    }

    set data(value: T) {
        this.#data = value;
    }

    /**
     * Load file from disk into memory.
     */
    load(): void {
        try {
            if (!fs.existsSync(this.#dataDir)) {
                fs.mkdirSync(this.#dataDir, { recursive: true });
            }
            if (fs.existsSync(this.#filePath)) {
                const raw = fs.readFileSync(this.#filePath, 'utf8');
                if (raw.trim()) {
                    this.#data = this._parseData(raw);
                }
            }
        } catch (err: any) {
            console.error(`[${this.constructor.name}] Failed to load file:`, err.message);
            this.#data = {} as T;
        }
    }

    /**
     * Hook to parse raw file contents.
     */
    protected _parseData(raw: string): T {
        return JSON.parse(raw);
    }

    /**
     * Hook to serialize memory contents to string.
     */
    protected _serializeData(data: T): string {
        return JSON.stringify(data, null, 2);
    }

    /**
     * Schedule a debounced save to disk.
     */
    save(): void {
        if (this.#debounceTimer) {
            clearTimeout(this.#debounceTimer);
        }
        this.#debounceTimer = setTimeout(() => {
            this.flush();
        }, this.#debounceMs);
    }

    /**
     * Immediately write memory state to disk and clear pending timer.
     * Uses atomic write (write to temp file then rename) to prevent file corruption.
     */
    flush(): void {
        if (this.#debounceTimer) {
            clearTimeout(this.#debounceTimer);
            this.#debounceTimer = null;
        }
        const tempFilePath = `${this.#filePath}.tmp.${Date.now()}`;
        try {
            if (!fs.existsSync(this.#dataDir)) {
                fs.mkdirSync(this.#dataDir, { recursive: true });
            }
            const serialized = this._serializeData(this.#data);
            fs.writeFileSync(tempFilePath, serialized, 'utf8');
            fs.renameSync(tempFilePath, this.#filePath);
        } catch (err: any) {
            console.error(`[${this.constructor.name}] Failed to save file:`, err.message);
            try {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            } catch {
                // Ignore temp cleanup error
            }
        }
    }
}

export default BaseJsonFileStore;
