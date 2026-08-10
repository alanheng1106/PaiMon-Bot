const BaseMessageHandler = require('./BaseMessageHandler');

/**
 * MessagePipeline — Executes a sequence of BaseMessageHandler instances using the Chain of Responsibility pattern.
 */
class MessagePipeline {
    #handlers = [];

    /**
     * @param {BaseMessageHandler[]} handlers Initial handlers array
     */
    constructor(handlers = []) {
        for (const handler of handlers) {
            this.use(handler);
        }
    }

    /**
     * Register a new handler to the pipeline.
     * @param {BaseMessageHandler} handler 
     * @returns {MessagePipeline}
     */
    use(handler) {
        if (!(handler instanceof BaseMessageHandler)) {
            throw new TypeError('[MessagePipeline] Handler must extend BaseMessageHandler.');
        }
        this.#handlers.push(handler);
        return this;
    }

    /**
     * Execute all registered handlers in sequence until a handler consumes the message or pipeline finishes.
     * @param {import('discord.js').Message} message 
     * @param {import('../core/BotClient')} bot 
     */
    async execute(message, bot) {
        for (const handler of this.#handlers) {
            try {
                const consumed = await handler.handle(message, bot);
                if (consumed === true) {
                    break;
                }
            } catch (error) {
                console.error(`[MessagePipeline] Error in handler [${handler.constructor.name}]:`, error.stack || error.message);
            }
        }
    }
}

module.exports = MessagePipeline;
