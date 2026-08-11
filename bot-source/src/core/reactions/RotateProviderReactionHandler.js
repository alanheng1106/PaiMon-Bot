const BaseReactionHandler = require('./BaseReactionHandler');

/**
 * RotateProviderReactionHandler — Single responsibility strategy for rotating link providers on reaction (🔄).
 */
class RotateProviderReactionHandler extends BaseReactionHandler {
    #linkFixer;

    constructor(linkFixer = null) {
        super();
        this.#linkFixer = linkFixer;
    }

    canHandle(emojiName, settings) {
        return emojiName === settings.rotateFixEmoji;
    }

    async execute({ reaction, user, message, tracked, bot }) {
        if (user.id !== tracked.authorId) return;

        const fixer = this.#linkFixer || bot?.linkFixer;
        if (!fixer) return;

        const newFixedLinks = [];
        let changed = false;

        for (const link of tracked.fixedLinks) {
            const rotated = fixer.rotateLinkProvider(link);
            if (rotated) {
                newFixedLinks.push(rotated);
                changed = true;
            } else {
                newFixedLinks.push(link);
            }
        }

        if (changed) {
            try {
                const newContent = newFixedLinks.join('\n');
                if (message.webhookId && bot?.fetchWebhook) {
                    const webhook = await bot.fetchWebhook(message.webhookId).catch(() => null);
                    if (webhook) {
                        await webhook.editMessage(message.id, { content: newContent });
                    } else {
                        await message.edit({ content: newContent });
                    }
                } else {
                    await message.edit({ content: newContent });
                }

                tracked.fixedLinks = newFixedLinks;
                fixer.trackFixedMessage(message.id, tracked);
            } catch (err) {
                console.warn('[RotateProviderReactionHandler] Failed to edit message:', err.message);
            }
        }

        // Remove user reaction so user can click again
        try {
            await reaction.users.remove(user.id);
        } catch (err) {
            // Ignore missing permission
        }
    }
}

module.exports = RotateProviderReactionHandler;
