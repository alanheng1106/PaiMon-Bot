const BaseComponentHandler = require('./BaseComponentHandler');

/**
 * ComponentRouter — Centralized Router for Discord Buttons, Modals, and Select Menus.
 * Eliminates monolithic if-else blocks in interaction listeners.
 */
class ComponentRouter {
    #handlers = new Map();

    /**
     * Register a component handler.
     * @param {BaseComponentHandler} handler 
     */
    register(handler) {
        if (!(handler instanceof BaseComponentHandler)) {
            throw new TypeError('[ComponentRouter] Registered handler must extend BaseComponentHandler.');
        }
        this.#handlers.set(handler.customId, handler);
        return this;
    }

    /**
     * Check if a customId has a registered handler.
     * @param {string} customId 
     * @returns {boolean}
     */
    has(customId) {
        return this.#handlers.has(customId);
    }

    /**
     * Route an incoming interaction to its registered handler.
     * @param {import('discord.js').Interaction} interaction 
     * @param {import('../BotClient')} bot 
     * @returns {Promise<boolean>} Returns true if handled
     */
    async handle(interaction, bot) {
        const customId = interaction.customId;
        if (!customId) return false;

        const handler = this.#handlers.get(customId);
        if (handler) {
            await handler.execute(interaction, bot);
            return true;
        }

        return false;
    }
}

module.exports = ComponentRouter;
