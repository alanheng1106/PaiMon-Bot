const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BaseMessageHandler = require('../src/pipeline/BaseMessageHandler');
const MessagePipeline = require('../src/pipeline/MessagePipeline');

class MockHandler extends BaseMessageHandler {
    constructor(name, shouldConsume = false) {
        super();
        this.name = name;
        this.shouldConsume = shouldConsume;
        this.executed = false;
    }

    async handle(message, bot) {
        this.executed = true;
        return this.shouldConsume;
    }
}

describe('MessagePipeline (Chain of Responsibility)', () => {
    it('executes all handlers if none consume the message', async () => {
        const h1 = new MockHandler('h1', false);
        const h2 = new MockHandler('h2', false);
        const pipeline = new MessagePipeline([h1, h2]);

        await pipeline.execute({ content: 'test' }, {});

        assert.equal(h1.executed, true, 'Handler 1 should have executed');
        assert.equal(h2.executed, true, 'Handler 2 should have executed');
    });

    it('stops execution as soon as a handler consumes the message', async () => {
        const h1 = new MockHandler('h1', true);
        const h2 = new MockHandler('h2', false);
        const pipeline = new MessagePipeline([h1, h2]);

        await pipeline.execute({ content: 'test' }, {});

        assert.equal(h1.executed, true, 'Handler 1 should have executed and consumed');
        assert.equal(h2.executed, false, 'Handler 2 should NOT execute after consumption');
    });

    it('throws error if handler does not extend BaseMessageHandler', () => {
        const pipeline = new MessagePipeline();
        assert.throws(() => {
            pipeline.use({});
        }, TypeError);
    });
});
