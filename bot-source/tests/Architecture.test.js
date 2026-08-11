const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ServiceContainer = require('../src/core/ServiceContainer');
const AppContainerBuilder = require('../src/core/bot/AppContainerBuilder');
const MusicManager = require('../src/core/MusicManager');
const ToolRegistry = require('../src/core/tools/ToolRegistry');
const BaseTool = require('../src/core/tools/BaseTool');
const ComponentRouter = require('../src/core/components/ComponentRouter');
const BaseComponentHandler = require('../src/core/components/BaseComponentHandler');

describe('ServiceContainer & AppContainerBuilder (Dependency Injection)', () => {
    it('registers and retrieves a direct instance', () => {
        const container = new ServiceContainer();
        const dummyService = { name: 'test-service' };
        container.register('dummy', dummyService);

        assert.equal(container.has('dummy'), true);
        assert.equal(container.get('dummy'), dummyService);
    });

    it('registers a factory and resolves it as a singleton', () => {
        const container = new ServiceContainer();
        let initCount = 0;
        container.register('factoryService', () => {
            initCount++;
            return { id: Math.random() };
        });

        assert.equal(initCount, 0);
        const service1 = container.get('factoryService');
        assert.equal(initCount, 1);
        const service2 = container.get('factoryService');
        assert.equal(initCount, 1); // Should reuse cached singleton
        assert.equal(service1, service2);
    });

    it('throws when getting an unregistered service', () => {
        const container = new ServiceContainer();
        assert.throws(() => container.get('nonexistent'), /is not registered/);
    });

    it('builds default container via AppContainerBuilder Composition Root', () => {
        const container = AppContainerBuilder.buildDefaultContainer();
        assert.ok(container.has('music'));
        assert.ok(container.has('ai'));
        assert.ok(container.has('lavalinkService'));
        assert.ok(container.has('settings'));
        assert.ok(container.has('cooldowns'));
        assert.ok(container.has('valorant'));
        assert.ok(container.has('linkFixer'));
        assert.ok(container.has('components'));
        assert.ok(container.has('reactionRouter'));
    });

    it('enforces strict constructor parameter contract on MusicManager', () => {
        assert.throws(() => new MusicManager(null), /LavalinkService instance is required/);

        const mockLavalink = { shoukaku: {} };
        const manager = new MusicManager(mockLavalink);
        assert.equal(manager.shoukaku, mockLavalink.shoukaku);
    });
});

describe('ToolRegistry (Strategy Pattern for AI Tools)', () => {
    class DummyTool extends BaseTool {
        get definition() {
            return {
                type: 'function',
                function: {
                    name: 'dummy_tool',
                    description: 'Dummy tool for unit testing',
                    parameters: { type: 'object', properties: {} }
                }
            };
        }

        async execute(args) {
            return `Processed ${args.val}`;
        }
    }

    it('registers a BaseTool and exports definitions', () => {
        const registry = new ToolRegistry();
        const tool = new DummyTool();
        registry.register(tool);

        assert.equal(registry.has('dummy_tool'), true);
        const defs = registry.getDefinitions();
        assert.equal(defs.length, 1);
        assert.equal(defs[0].function.name, 'dummy_tool');
    });

    it('executes a tool strategy by name', async () => {
        const registry = new ToolRegistry();
        registry.register(new DummyTool());

        const result = await registry.execute('dummy_tool', { val: 'hello' });
        assert.equal(result, 'Processed hello');
    });

    it('rejects registering invalid tool objects', () => {
        const registry = new ToolRegistry();
        assert.throws(() => registry.register({}), /must extend BaseTool/);
    });
});

describe('ComponentRouter (Command/Router Pattern for UI)', () => {
    class DummyButtonHandler extends BaseComponentHandler {
        get customId() {
            return 'dummy_button';
        }

        async execute(interaction) {
            interaction.handled = true;
        }
    }

    it('registers and dispatches interaction to registered handler', async () => {
        const router = new ComponentRouter();
        router.register(new DummyButtonHandler());

        assert.equal(router.has('dummy_button'), true);

        const mockInteraction = { customId: 'dummy_button', handled: false };
        const handled = await router.handle(mockInteraction, {});
        assert.equal(handled, true);
        assert.equal(mockInteraction.handled, true);
    });

    it('returns false when customId has no registered handler', async () => {
        const router = new ComponentRouter();
        const handled = await router.handle({ customId: 'unknown_button' }, {});
        assert.equal(handled, false);
    });
});
