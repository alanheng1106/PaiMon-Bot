const BaseReactionHandler = require('./BaseReactionHandler');
const DeleteFixedMessageReactionHandler = require('./DeleteFixedMessageReactionHandler');
const RotateProviderReactionHandler = require('./RotateProviderReactionHandler');

/**
 * ReactionRouter — Central strategy router for processing reaction interactions.
 */
class ReactionRouter {
    #handlers = [];

    /**
     * @param {Array<BaseReactionHandler>} [handlers] 
     * @param {Object} [linkFixer] 
     */
    constructor(handlers = [], linkFixer = null) {
        if (handlers.length > 0) {
            handlers.forEach(h => this.register(h));
        } else {
            // Default built-in reaction strategies
            this.register(new DeleteFixedMessageReactionHandler(linkFixer));
            this.register(new RotateProviderReactionHandler(linkFixer));
        }
    }

    /**
     * Register a new reaction handler strategy.
     * @param {BaseReactionHandler} handler 
     */
    register(handler) {
        if (!(handler instanceof BaseReactionHandler)) {
            throw new Error('[ReactionRouter] Handler must be an instance of BaseReactionHandler.');
        }
        this.#handlers.push(handler);
    }

    get handlers() {
        return [...this.#handlers];
    }

    /**
     * Dispatch reaction interaction to matching handler.
     * @param {Object} context - { reaction, user, bot }
     * @returns {Promise<boolean>} True if handled, false otherwise
     */
    async handle(context) {
        const { reaction, user, bot } = context;
        if (user.bot) return false;

        if (reaction.partial) {
            try { await reaction.fetch(); } catch (error) { return false; }
        }
        if (reaction.message.partial) {
            try { await reaction.message.fetch(); } catch (error) { return false; }
        }

        const message = reaction.message;
        if (!message || !message.guild) return false;

        const linkFixer = bot?.linkFixer || bot?.container?.get('linkFixer');
        const settings = bot?.settings || bot?.container?.get('settings');

        if (!linkFixer || !settings) return false;

        const tracked = linkFixer.getFixedMessage(message.id);
        if (!tracked) return false;

        const guildSettings = settings.getLinkFixerSettings(message.guild.id);
        const emojiName = reaction.emoji.name;

        for (const handler of this.#handlers) {
            if (handler.canHandle(emojiName, guildSettings)) {
                await handler.execute({ reaction, user, message, tracked, bot });
                return true;
            }
        }

        return false;
    }
}

module.exports = ReactionRouter;
