const fs = require('fs');

/**
 * BaseJsonFileStore — Abstract base class for debounced JSON file persistence.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class BaseJsonFileStore {
    #dataDir;
    #filePath;
    #debounceMs;
    #debounceTimer = null;
    #data = {};

    /**
     * @param {string} dataDir 
     * @param {string} filePath 
     * @param {number} [debounceMs=500] 
     */
    constructor(dataDir, filePath, debounceMs = 500) {
        this.#dataDir = dataDir;
        this.#filePath = filePath;
        this.#debounceMs = debounceMs;
        this.load();
    }

    get dataDir() {
        return this.#dataDir;
    }

    set dataDir(val) {
        this.#dataDir = val;
    }

    get filePath() {
        return this.#filePath;
    }

    set filePath(val) {
        this.#filePath = val;
    }

    get _debounceTimer() {
        return this.#debounceTimer;
    }

    get data() {
        return this.#data;
    }

    set data(value) {
        this.#data = value;
    }

    /**
     * Load file from disk into memory.
     */
    load() {
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
        } catch (err) {
            console.error(`[${this.constructor.name}] Failed to load file:`, err.message);
            this.#data = {};
        }
    }

    /**
     * Hook to parse raw file contents.
     * @protected
     */
    _parseData(raw) {
        return JSON.parse(raw);
    }

    /**
     * Hook to serialize memory contents to string.
     * @protected
     */
    _serializeData(data) {
        return JSON.stringify(data, null, 2);
    }

    /**
     * Schedule a debounced save to disk.
     */
    save() {
        clearTimeout(this.#debounceTimer);
        this.#debounceTimer = setTimeout(() => {
            this.flush();
        }, this.#debounceMs);
    }

    /**
     * Immediately write memory state to disk and clear pending timer.
     */
    flush() {
        clearTimeout(this.#debounceTimer);
        try {
            if (!fs.existsSync(this.#dataDir)) {
                fs.mkdirSync(this.#dataDir, { recursive: true });
            }
            const serialized = this._serializeData(this.#data);
            fs.writeFileSync(this.#filePath, serialized, 'utf8');
        } catch (err) {
            console.error(`[${this.constructor.name}] Failed to save file:`, err.message);
        }
    }
}

module.exports = BaseJsonFileStore;
