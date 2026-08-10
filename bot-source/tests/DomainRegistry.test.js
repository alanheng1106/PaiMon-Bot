const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DomainRegistry = require('../src/core/linkfixer/DomainRegistry');

describe('DomainRegistry (Open-Closed Principle)', () => {
    it('initializes with default domains list', () => {
        const registry = new DomainRegistry();
        const domains = registry.getAll();
        assert.ok(domains.length > 10);
        assert.ok(registry.has('twitter'));
        assert.ok(registry.has('pixiv'));
    });

    it('allows registering custom domain fix strategies (OCP)', () => {
        const registry = new DomainRegistry([]);
        assert.equal(registry.getAll().length, 0);

        registry.register({
            id: 'custom_platform',
            name: 'Custom Platform',
            color: '#123456',
            enabledByDefault: true,
            patterns: [/https?:\/\/custom\.com\/\S*/gi],
            providers: [{ id: 'fixer', default: true, replacements: [] }]
        });

        assert.equal(registry.has('custom_platform'), true);
        const custom = registry.getById('custom_platform');
        assert.equal(custom.name, 'Custom Platform');
    });

    it('rejects invalid domain configurations', () => {
        const registry = new DomainRegistry();
        assert.throws(() => registry.register({ id: 'invalid' }), /Invalid domain configuration/);
    });
});
