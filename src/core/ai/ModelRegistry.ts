import type ILLMProvider from './ILLMProvider';
import type GuildSettings from '../GuildSettings';

export interface ModelEntry {
    id: string;
    name: string;
    providerKey: string;
    model: string;
    provider: ILLMProvider;
    description?: string;
    isDefault?: boolean;
    supportsVision?: boolean;
}

export interface ModelStatusInfo {
    id: string;
    name: string;
    providerKey: string;
    model: string;
    isAvailable: boolean;
    isDefault: boolean;
    description?: string;
}

/**
 * ModelRegistry — Central catalog and router for AI models and their corresponding providers.
 * Supports:
 * - Dynamic runtime model registration
 * - Global active model state
 * - Per-guild model selection persistence via GuildSettings
 * - Seamless hot-switching without service restarts
 */
class ModelRegistry {
    #models: Map<string, ModelEntry> = new Map();
    #defaultModelId: string = 'vtc-deepseek';
    #settings: GuildSettings | null = null;

    constructor(settings: GuildSettings | null = null) {
        this.#settings = settings;
    }

    setSettings(settings: GuildSettings): void {
        this.#settings = settings;
    }

    /**
     * Register or update a model entry in the catalog.
     */
    registerModel(entry: ModelEntry): void {
        this.#models.set(entry.id, entry);
        if (entry.isDefault || this.#models.size === 1) {
            this.#defaultModelId = entry.id;
        }
    }

    /**
     * Get a specific model entry by ID.
     */
    getModel(id: string): ModelEntry | null {
        return this.#models.get(id) || null;
    }

    /**
     * Finds the best registered multimodal vision model (e.g. Gemini, GPT, Qwen).
     */
    findVisionModel(): ModelEntry | null {
        for (const entry of this.#models.values()) {
            if (entry.supportsVision === true) return entry;
        }
        for (const entry of this.#models.values()) {
            const id = (entry.id || '').toLowerCase();
            const m = (entry.model || '').toLowerCase();
            if (
                entry.supportsVision !== false &&
                (id.includes('gemini') ||
                    id.includes('gpt') ||
                    id.includes('qwen') ||
                    id.includes('vision') ||
                    m.includes('gemini') ||
                    m.includes('gpt') ||
                    m.includes('qwen') ||
                    m.includes('vision'))
            ) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Check if a model exists in the catalog.
     */
    hasModel(id: string): boolean {
        return this.#models.has(id);
    }

    /**
     * Get the default global model ID.
     */
    get defaultModelId(): string {
        return this.#defaultModelId;
    }

    /**
     * Set the default global model ID.
     */
    setDefaultModelId(id: string): boolean {
        if (!this.#models.has(id)) return false;
        this.#defaultModelId = id;
        return true;
    }

    /**
     * Resolves the active model ID for a specific guild (or fallback to global default).
     */
    getActiveModelId(guildId?: string | null): string {
        if (guildId && this.#settings) {
            const guildChoice = this.#settings.get<string>(guildId, 'aiModel');
            if (guildChoice && this.#models.has(guildChoice)) {
                return guildChoice;
            }
        }
        return this.#defaultModelId;
    }

    /**
     * Resolves the full active ModelEntry for a specific guild (or fallback to global default).
     */
    resolveActiveModel(guildId?: string | null): ModelEntry {
        const activeId = this.getActiveModelId(guildId);
        const model = this.#models.get(activeId);
        if (model) return model;

        // If active model is missing, fallback to any available model
        const firstEntry = this.#models.values().next().value;
        if (firstEntry) return firstEntry;

        throw new Error('[ModelRegistry] 尚未註冊任何可用的 AI 模型');
    }

    /**
     * Sets the active model for a guild (persisted), or globally if no guildId is provided.
     */
    switchModel(modelId: string, guildId?: string | null): boolean {
        if (!this.#models.has(modelId)) {
            return false;
        }

        if (guildId && this.#settings) {
            this.#settings.set(guildId, 'aiModel', modelId);
        } else {
            this.#defaultModelId = modelId;
        }
        return true;
    }

    /**
     * Returns a summary list of all registered models with their availability status.
     */
    listModels(guildId?: string | null): ModelStatusInfo[] {
        const activeId = this.getActiveModelId(guildId);
        return Array.from(this.#models.values()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            providerKey: entry.providerKey,
            model: entry.model,
            isAvailable: entry.provider.ready,
            isDefault: entry.id === activeId,
            description: entry.description
        }));
    }

    /**
     * Tests connectivity to a specific model backend.
     */
    async testModel(modelId: string): Promise<{ ok: boolean; latency: number; error?: string }> {
        const entry = this.#models.get(modelId);
        if (!entry) {
            return { ok: false, latency: -1, error: `找不到模型: ${modelId}` };
        }

        const provider = entry.provider as any;
        if (typeof provider.testConnection === 'function') {
            return await provider.testConnection();
        }

        // Fallback for providers without dedicated testConnection
        const start = performance.now();
        try {
            // Test with a quick 0-token stream request
            const stream = provider.chatStream({
                model: entry.model,
                messages: [{ role: 'user', content: 'hi' }]
            });
            await stream.next();
            const latency = Math.max(0.1, Number((performance.now() - start).toFixed(1)));
            return { ok: true, latency };
        } catch (err: any) {
            return { ok: false, latency: -1, error: err.message };
        }
    }
}

export default ModelRegistry;
