import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ModelRegistry from '../src/core/ai/ModelRegistry';

describe('ModelRegistry (Multi-Model Hot-Switching & Routing)', () => {
    class DummyProvider {
        constructor(ready = true) {
            this._ready = ready;
        }
        get ready() {
            return this._ready;
        }
        async *chatStream() {
            yield { content: 'dummy' };
        }
    }

    class MockGuildSettings {
        constructor() {
            this.store = {};
        }
        get(guildId, key) {
            return this.store[guildId]?.[key] ?? null;
        }
        set(guildId, key, val) {
            if (!this.store[guildId]) this.store[guildId] = {};
            this.store[guildId][key] = val;
        }
    }

    it('registers models and designates the first or marked model as default', () => {
        const registry = new ModelRegistry();
        const p1 = new DummyProvider();
        const p2 = new DummyProvider();

        registry.registerModel({
            id: 'ollama-gemma',
            name: 'Gemma 4 (Ollama)',
            providerKey: 'ollama',
            model: 'gemma4:31b-cloud',
            provider: p1,
            isDefault: true
        });

        registry.registerModel({
            id: 'friend-ai',
            name: 'Friend Custom Model',
            providerKey: 'friend',
            model: 'qwen2.5:32b',
            provider: p2
        });

        assert.equal(registry.defaultModelId, 'ollama-gemma');
        assert.equal(registry.hasModel('ollama-gemma'), true);
        assert.equal(registry.hasModel('friend-ai'), true);
        assert.equal(registry.hasModel('nonexistent'), false);
    });

    it('resolves active model globally and falls back when no guild override exists', () => {
        const registry = new ModelRegistry();
        const p1 = new DummyProvider();
        registry.registerModel({
            id: 'ollama-gemma',
            name: 'Gemma 4',
            providerKey: 'ollama',
            model: 'gemma4',
            provider: p1,
            isDefault: true
        });

        assert.equal(registry.getActiveModelId(), 'ollama-gemma');
        assert.equal(registry.getActiveModelId('guild-123'), 'ollama-gemma');

        const active = registry.resolveActiveModel();
        assert.equal(active.id, 'ollama-gemma');
        assert.equal(active.model, 'gemma4');
    });

    it('persists and resolves per-guild model selection via GuildSettings', () => {
        const mockSettings = new MockGuildSettings();
        const registry = new ModelRegistry(mockSettings);
        const p1 = new DummyProvider();
        const p2 = new DummyProvider();

        registry.registerModel({
            id: 'ollama-gemma',
            name: 'Gemma 4',
            providerKey: 'ollama',
            model: 'gemma4',
            provider: p1,
            isDefault: true
        });

        registry.registerModel({
            id: 'friend-ai',
            name: 'Friend AI',
            providerKey: 'friend',
            model: 'qwen2.5:32b',
            provider: p2
        });

        // Switch model for guild-1
        const success = registry.switchModel('friend-ai', 'guild-1');
        assert.equal(success, true);

        // Guild 1 should now use friend-ai
        assert.equal(registry.getActiveModelId('guild-1'), 'friend-ai');
        const activeGuild1 = registry.resolveActiveModel('guild-1');
        assert.equal(activeGuild1.id, 'friend-ai');
        assert.equal(activeGuild1.model, 'qwen2.5:32b');

        // Guild 2 should still use default ollama-gemma
        assert.equal(registry.getActiveModelId('guild-2'), 'ollama-gemma');

        // Global default should still be ollama-gemma
        assert.equal(registry.getActiveModelId(), 'ollama-gemma');
    });

    it('supports switching global default model when guildId is omitted', () => {
        const registry = new ModelRegistry();
        const p1 = new DummyProvider();
        const p2 = new DummyProvider();

        registry.registerModel({
            id: 'ollama-gemma',
            name: 'Gemma 4',
            providerKey: 'ollama',
            model: 'gemma4',
            provider: p1,
            isDefault: true
        });

        registry.registerModel({
            id: 'friend-ai',
            name: 'Friend AI',
            providerKey: 'friend',
            model: 'qwen2.5:32b',
            provider: p2
        });

        registry.switchModel('friend-ai');
        assert.equal(registry.defaultModelId, 'friend-ai');
        assert.equal(registry.getActiveModelId(), 'friend-ai');
    });

    it('lists registered models with active indicator and availability', () => {
        const registry = new ModelRegistry();
        registry.registerModel({
            id: 'ollama-gemma',
            name: 'Gemma 4',
            providerKey: 'ollama',
            model: 'gemma4',
            provider: new DummyProvider(true),
            isDefault: true
        });

        registry.registerModel({
            id: 'friend-ai',
            name: 'Friend AI',
            providerKey: 'friend',
            model: 'qwen',
            provider: new DummyProvider(false)
        });

        const list = registry.listModels();
        assert.equal(list.length, 2);
        assert.equal(list[0].id, 'ollama-gemma');
        assert.equal(list[0].isDefault, true);
        assert.equal(list[0].isAvailable, true);

        assert.equal(list[1].id, 'friend-ai');
        assert.equal(list[1].isDefault, false);
        assert.equal(list[1].isAvailable, false);
    });
});
