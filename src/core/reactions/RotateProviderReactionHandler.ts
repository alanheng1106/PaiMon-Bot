import { MessageFlags } from 'discord.js';
import BaseReactionHandler, { ReactionContext } from './BaseReactionHandler';
import ComponentV2CardBuilder from '../../builders/ComponentV2CardBuilder';

/**
 * RotateProviderReactionHandler — Single responsibility strategy for rotating link providers on reaction (🔄).
 */
class RotateProviderReactionHandler extends BaseReactionHandler {
    #linkFixer: any;
    static #inFlight = new Set<string>();

    constructor(linkFixer: any = null) {
        super();
        this.#linkFixer = linkFixer;
    }

    override canHandle(emojiName: string, settings: any): boolean {
        return emojiName === settings.rotateFixEmoji;
    }

    override async execute({ reaction, user, message, tracked, bot }: ReactionContext): Promise<void> {
        if (user.id !== tracked.authorId) return;

        const fixer = this.#linkFixer || bot?.linkFixer;
        if (!fixer) return;

        // Concurrency lock: Prevent race conditions from rapid consecutive clicks
        if (RotateProviderReactionHandler.#inFlight.has(message.id)) {
            return;
        }
        RotateProviderReactionHandler.#inFlight.add(message.id);

        try {
            const hasItems = Array.isArray(tracked.items) && tracked.items.length > 0;
            const newFixedLinks: string[] = [];
            const newItems: any[] = [];
            let changed = false;

            if (hasItems) {
                const newContainers: any[] = [];

                for (const item of tracked.items) {
                    const rotated = fixer.rotateLinkProvider(item.fixedUrl);
                    if (rotated) {
                        changed = true;
                        newFixedLinks.push(rotated);

                        // Resolve new provider details
                        const parsed = fixer.reverseParse(rotated) || fixer.reverseParse(item.fixedUrl);
                        const nextProvider = parsed
                            ? fixer.getNextProvider(parsed.domain.id, parsed.provider.id)
                            : null;

                        const newItem = {
                            ...item,
                            fixedUrl: rotated,
                            providerId: nextProvider?.id || item.providerId,
                            providerName: nextProvider?.name || item.providerName
                        };
                        newItems.push(newItem);

                        // Fetch new metadata for rotated provider
                        const og = await fixer.fetchOGMetadata(newItem.fixedUrl);
                        // Option 1: Rebuild container with new or fallback metadata
                        const container = ComponentV2CardBuilder.buildCard(newItem, og || {});
                        newContainers.push(container);
                    } else {
                        newFixedLinks.push(item.fixedUrl);
                        newItems.push(item);
                        const og = await fixer.fetchOGMetadata(item.fixedUrl);
                        const container = ComponentV2CardBuilder.buildCard(item, og || {});
                        newContainers.push(container);
                    }
                }

                if (changed && newContainers.length > 0) {
                    await message.edit({
                        components: newContainers,
                        flags: MessageFlags.IsComponentsV2 as any,
                        allowedMentions: { parse: [] }
                    });

                    tracked.fixedLinks = newFixedLinks;
                    tracked.items = newItems;
                    fixer.trackFixedMessage(message.id, tracked);
                }
            } else if (Array.isArray(tracked.fixedLinks)) {
                // Fallback for legacy tracked messages or mock tests without items
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
                }
            }
        } catch (err: any) {
            console.warn('[RotateProviderReactionHandler] Failed to edit message:', err.message);
        } finally {
            RotateProviderReactionHandler.#inFlight.delete(message.id);
            // Remove user reaction so user can click again
            try {
                await reaction.users.remove(user.id);
            } catch {
                // Ignore missing permission
            }
        }
    }
}

export default RotateProviderReactionHandler;
