import path from 'path';
import BaseJsonFileStore from '../utils/BaseJsonFileStore';
import { Guild as GuildConfig } from '../config';

export interface LinkFixerSettings {
    disabledDomains: string[];
    domainProviders: Record<string, string>;
}

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

    /**
     * Get link fixer settings for a guild with defaults.
     */
    getLinkFixerSettings(guildId: string): LinkFixerSettings {
        const defaultSettings: LinkFixerSettings = {
            disabledDomains: [],
            domainProviders: {}
        };
        const current = this.get(guildId, 'linkFixer', {});
        return { ...defaultSettings, ...current };
    }

    /**
     * Update link fixer settings for a guild.
     */
    setLinkFixerSettings(guildId: string, settings: Partial<LinkFixerSettings>): void {
        const current = this.getLinkFixerSettings(guildId);
        this.set(guildId, 'linkFixer', { ...current, ...settings });
    }
}

export default GuildSettings;
