import type { Message } from 'discord.js';
import type BotClient from '../core/BotClient';

/**
 * BaseMessageHandler — Abstract base class for all message handlers in the pipeline.
 * Follows Single Responsibility Principle (SRP) and Dependency Inversion Principle (DIP).
 */
abstract class BaseMessageHandler {
    /**
     * Handle incoming message.
     * @returns Resolves to true if message was handled/consumed, false otherwise.
     */
    abstract handle(message: Message, bot: BotClient | any): Promise<boolean>;
}

export default BaseMessageHandler;
