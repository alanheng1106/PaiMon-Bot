import { Message, MessageFlags } from 'discord.js';
import ComponentV2CardBuilder from '../builders/ComponentV2CardBuilder';
import BaseMessageHandler from '../pipeline/BaseMessageHandler';
import type BotClient from '../core/BotClient';

/**
 * LinkFixHandler — Handles social media link processing and Message Components V2 card replies.
 */
class LinkFixHandler extends BaseMessageHandler {
    /**
     * Process message content for social media links.
     */
    override async handle(message: Message, bot: BotClient | any): Promise<boolean> {
        if (!message.guild || !message.content) return false;

        try {
            const { fixedLinks, items } = await bot.linkFixer.process(message.content);

            if (fixedLinks.length === 0 || items.length === 0) return false;

            const containers = [];

            for (const item of items.slice(0, 5)) {
                const og = await bot.linkFixer.fetchLinkMetadata(item.fixedUrl);

                // Validation: Only create card if valid content exists
                const hasContent = og && (og.title || og.description || og.image || og.video);
                if (!hasContent) {
                    console.log(`[LinkFixHandler] Skipping link (no content found): ${item.originalUrl}`);
                    continue;
                }

                const container = ComponentV2CardBuilder.buildCard(item, og);
                containers.push(container);
            }

            // ONLY reply if at least 1 container with valid content was created!
            if (containers.length > 0) {
                // Suppress raw link embed preview on user's original message, NEVER delete user's message!
                await message.suppressEmbeds(true).catch(() => {});

                const payload: any = {
                    components: containers,
                    flags: MessageFlags.IsComponentsV2 as any,
                    allowedMentions: { parse: [] }
                };

                await message.reply(payload).catch(() => null);
                return true;
            } else {
                console.log('[LinkFixHandler] No valid metadata content found for links in message, ignoring.');
            }
        } catch (err: any) {
            console.error('[LinkFixHandler] Error processing links:', err.message);
        }

        return false;
    }
}

export default LinkFixHandler;
