import path from 'path';
import BaseJsonFileStore from '../utils/BaseJsonFileStore';
import { Guild as GuildConfig } from '../config';

/**
 * Lightweight JSON-based guild settings persistence.
 * Extends BaseJsonFileStore for debounced disk persistence.
 */
class GuildSettings extends BaseJsonFileStore<Record<string, any>> {
    constructor() {
        const dataDir = path.join(__dirname, '..', '..', 'data');
        const filePath = path.join(dataDir, 'guild-settings.json');
        super(dataDir, filePath, GuildConfig.SaveDebounceMs || 500);
    }

    /**
     * Get a guild setting value.
     */
    get<T = any>(guildId: string, key: string, defaultValue: T | null = null): T | null {
        return this.data[guildId]?.[key] ?? defaultValue;
    }

    /**
     * Set a guild setting value and persist to disk.
     */
    set(guildId: string, key: string, value: any): void {
        if (!this.data[guildId]) this.data[guildId] = {};
        this.data[guildId][key] = value;
        this.save();
    }
}

export default GuildSettings;
