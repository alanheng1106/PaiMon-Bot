/**
 * BaseComponentHandler — Abstract Base Class for Discord Buttons, Modals, and Select Menus.
 * Enforces Command/Router Pattern & Open-Closed Principle (OCP).
 */
class BaseComponentHandler {
    /**
     * Unique customId or customId prefix handled by this component.
     * @returns {string}
     */
    get customId() {
        throw new Error('[BaseComponentHandler] customId must be implemented by subclass.');
    }

    /**
     * Execute interaction logic.
     * @param {import('discord.js').Interaction} interaction 
     * @param {import('../BotClient')} bot 
     * @returns {Promise<void>}
     */
    async execute(interaction, bot) {
        throw new Error('[BaseComponentHandler] execute() must be implemented by subclass.');
    }
}

module.exports = BaseComponentHandler;
