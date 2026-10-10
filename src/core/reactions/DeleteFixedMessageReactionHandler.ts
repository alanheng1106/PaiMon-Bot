import BaseReactionHandler, { ReactionContext } from './BaseReactionHandler';

/**
 * DeleteFixedMessageReactionHandler — Single responsibility strategy for handling fixed message deletion reactions (❌).
 */
class DeleteFixedMessageReactionHandler extends BaseReactionHandler {
    #linkFixer: any;

    constructor(linkFixer: any = null) {
        super();
        this.#linkFixer = linkFixer;
    }

    override canHandle(emojiName: string, settings: any): boolean {
        return emojiName === settings.deleteMsgEmoji;
    }

    override async execute({ reaction: _reaction, user, message, tracked, bot }: ReactionContext): Promise<void> {
        const fixer = this.#linkFixer || bot?.linkFixer;
        const member =
            message.guild.members.cache.get(user.id) || (await message.guild.members.fetch(user.id).catch(() => null));
        const isAuthor = user.id === tracked.authorId;
        const canManage = member && member.permissions.has('ManageMessages');

        if (isAuthor || canManage) {
            try {
                await message.delete();
                if (fixer) {
                    fixer.forgetFixedMessage(message.id);
                }
            } catch (err: any) {
                console.warn('[DeleteFixedMessageReactionHandler] Failed to delete message:', err.message);
            }
        }
    }
}

export default DeleteFixedMessageReactionHandler;
