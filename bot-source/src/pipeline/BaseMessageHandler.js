/**
 * BaseMessageHandler — Abstract base class for all message handlers in the pipeline.
 * Follows Single Responsibility Principle (SRP) and Dependency Inversion Principle (DIP).
 */
class BaseMessageHandler {
    /**
     * Handle incoming message.
     * @param {import('discord.js').Message} message 
     * @param {import('../core/BotClient')} bot 
     * @returns {Promise<boolean>} Resolves to true if message was handled/consumed, false otherwise.
     */
    async handle(message, bot) {
        throw new Error(`Method [handle] must be implemented by subclass ${this.constructor.name}.`);
    }
}

module.exports = BaseMessageHandler;
