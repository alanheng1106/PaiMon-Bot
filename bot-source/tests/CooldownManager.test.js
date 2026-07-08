const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const CooldownManager = require('../src/core/CooldownManager');

describe('CooldownManager', () => {
    let cm;

    beforeEach(() => {
        cm = new CooldownManager();
    });

    it('returns null on first use (no cooldown active)', () => {
        const result = cm.check('play', 'user1', 5);
        assert.equal(result, null);
    });

    it('returns remaining seconds when on cooldown', () => {
        cm.check('play', 'user1', 5);
        const result = cm.check('play', 'user1', 5);
        assert.notEqual(result, null);
        // Should be a string like "5.0" or "4.9"
        const remaining = parseFloat(result);
        assert.ok(remaining > 0 && remaining <= 5, `Expected 0 < ${remaining} <= 5`);
    });

    it('isolates cooldowns per user', () => {
        cm.check('play', 'user1', 5);
        // user2 should not be on cooldown
        const result = cm.check('play', 'user2', 5);
        assert.equal(result, null);
    });

    it('isolates cooldowns per command', () => {
        cm.check('play', 'user1', 5);
        // Same user, different command should not be on cooldown
        const result = cm.check('skip', 'user1', 5);
        assert.equal(result, null);
    });

    it('returns null when cooldown is 0 or negative', () => {
        assert.equal(cm.check('play', 'user1', 0), null);
        assert.equal(cm.check('play', 'user1', -1), null);
    });

    it('returns null when cooldown is undefined', () => {
        assert.equal(cm.check('play', 'user1', undefined), null);
    });

    it('allows usage after cooldown expires', async () => {
        cm.check('play', 'user1', 0.1); // 100ms cooldown
        // Wait for cooldown to expire
        await new Promise((resolve) => setTimeout(resolve, 150));
        const result = cm.check('play', 'user1', 0.1);
        assert.equal(result, null);
    });
});
