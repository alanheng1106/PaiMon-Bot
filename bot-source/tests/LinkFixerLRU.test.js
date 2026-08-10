const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LinkFixer = require('../src/core/LinkFixer');

describe('LinkFixer LRUCache Memory Safety', () => {
    it('stores fixed messages up to capacity without unbounded Map growth', () => {
        const fixer = new LinkFixer();

        // Track 2500 messages (exceeding capacity of 2000)
        for (let i = 1; i <= 2500; i++) {
            fixer.trackFixedMessage(`msg_${i}`, { authorId: '123', originalContent: `test ${i}` });
        }

        // LRU Cache size should be capped at 2000
        assert.equal(fixer.fixedMessages.size, 2000, 'LRU cache size must be capped at 2000');

        // Early messages (1 to 500) should have been automatically evicted
        assert.equal(fixer.getFixedMessage('msg_1'), undefined, 'Oldest message msg_1 should be evicted');
        assert.equal(fixer.getFixedMessage('msg_500'), undefined, 'Oldest message msg_500 should be evicted');

        // Recent messages (msg_501 to msg_2500) should be present
        assert.ok(fixer.getFixedMessage('msg_501'), 'Message msg_501 should be present in cache');
        assert.ok(fixer.getFixedMessage('msg_2500'), 'Message msg_2500 should be present in cache');
    });

    it('deletes tracked messages using forgetFixedMessage', () => {
        const fixer = new LinkFixer();
        fixer.trackFixedMessage('msg_test', { authorId: '999' });
        assert.ok(fixer.getFixedMessage('msg_test'));

        fixer.forgetFixedMessage('msg_test');
        assert.equal(fixer.getFixedMessage('msg_test'), undefined);
    });
});
