/**
 * BaseReactionHandler — Abstract strategy base class for reaction actions.
 */
class BaseReactionHandler {
    /**
     * Determine if this strategy can handle the given emoji and guild settings.
     * @param {string} emojiName 
     * @param {Object} settings 
     * @returns {boolean}
     */
    canHandle(emojiName, settings) {
        throw new Error('[BaseReactionHandler] canHandle method must be implemented.');
    }

    /**
     * Execute reaction action strategy.
     * @param {Object} context - { reaction, user, message, tracked, bot }
     */
    async execute(context) {
        throw new Error('[BaseReactionHandler] execute method must be implemented.');
    }
}

module.exports = BaseReactionHandler;
