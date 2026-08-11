const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DiscordStreamUpdater = require('../src/core/ai/DiscordStreamUpdater');

describe('DiscordStreamUpdater (Safe Streaming Message Edit Queue)', () => {
    class MockMessage {
        constructor() {
            this.edits = [];
        }
        async edit(payload) {
            this.edits.push(payload.content);
            return this;
        }
    }

    it('buffers updates and edits message cleanly', async () => {
        const mockMsg = new MockMessage();
        const updater = new DiscordStreamUpdater(mockMsg, 50);

        await updater.push('Hello');
        await updater.push('Hello world');

        // Wait for throttled flush
        await new Promise((res) => setTimeout(res, 100));

        assert.ok(mockMsg.edits.length >= 1);
        assert.ok(mockMsg.edits[mockMsg.edits.length - 1].includes('Hello world'));
    });

    it('finalizes message without typing indicator suffix', async () => {
        const mockMsg = new MockMessage();
        const updater = new DiscordStreamUpdater(mockMsg, 50);

        await updater.push('Draft text');
        await updater.finalize('Final polished text');

        assert.equal(mockMsg.edits[mockMsg.edits.length - 1], 'Final polished text');
    });
});
