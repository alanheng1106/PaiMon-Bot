import BaseMessageHandler from './BaseMessageHandler';
import type { Message } from 'discord.js';
import type BotClient from '../core/BotClient';

/**
 * MessagePipeline — Executes a sequence of BaseMessageHandler instances using the Chain of Responsibility pattern.
 */
class MessagePipeline {
    #handlers: BaseMessageHandler[] = [];

    /**
     * @param handlers Initial handlers array
     */
    constructor(handlers: BaseMessageHandler[] = []) {
        for (const handler of handlers) {
            this.use(handler);
        }
    }

    /**
     * Register a new handler to the pipeline.
     */
    use(handler: BaseMessageHandler): this {
        if (!(handler instanceof BaseMessageHandler)) {
            throw new TypeError('[MessagePipeline] Handler must extend BaseMessageHandler.');
        }
        this.#handlers.push(handler);
        return this;
    }

    /**
     * Execute all registered handlers in sequence until a handler consumes the message or pipeline finishes.
     */
    async execute(message: Message, bot: BotClient | any): Promise<void> {
        for (const handler of this.#handlers) {
            try {
                const consumed = await handler.handle(message, bot);
                if (consumed === true) {
                    break;
                }
            } catch (error: any) {
                console.error(
                    `[MessagePipeline] Error in handler [${handler.constructor.name}]:`,
                    error.stack || error.message
                );
            }
        }
    }
}

export default MessagePipeline;
