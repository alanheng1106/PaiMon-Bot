const BaseReactionHandler = require('./BaseReactionHandler');

/**
 * DeleteFixedMessageReactionHandler — Single responsibility strategy for handling fixed message deletion reactions (❌).
 */
class DeleteFixedMessageReactionHandler extends BaseReactionHandler {
    #linkFixer;

    constructor(linkFixer = null) {
        super();
        this.#linkFixer = linkFixer;
    }

    canHandle(emojiName, settings) {
        return emojiName === settings.deleteMsgEmoji;
    }

    async execute({ reaction, user, message, tracked, bot }) {
        const fixer = this.#linkFixer || bot?.linkFixer;
        const member = message.guild.members.cache.get(user.id) || await message.guild.members.fetch(user.id).catch(() => null);
        const isAuthor = user.id === tracked.authorId;
        const canManage = member && member.permissions.has('ManageMessages');

        if (isAuthor || canManage) {
            try {
                await message.delete();
                if (fixer) {
                    fixer.forgetFixedMessage(message.id);
                }
            } catch (err) {
                console.warn('[DeleteFixedMessageReactionHandler] Failed to delete message:', err.message);
            }
        }
    }
}

module.exports = DeleteFixedMessageReactionHandler;
