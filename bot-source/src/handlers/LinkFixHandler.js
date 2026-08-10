const { MessageFlags } = require('discord.js');
const ComponentV2CardBuilder = require('../builders/ComponentV2CardBuilder');
const BaseMessageHandler = require('../pipeline/BaseMessageHandler');

/**
 * LinkFixHandler — Handles social media link processing and Message Components V2 card replies.
 */
class LinkFixHandler extends BaseMessageHandler {
    /**
     * Process message content for social media links.
     * @param {import('discord.js').Message} message 
     * @param {Object} bot 
     * @returns {Promise<boolean>} Returns true if links were handled and card replied
     */
    async handle(message, bot) {
        if (!message.guild || !message.content) return false;

        try {
            const settings = bot.settings.getLinkFixerSettings(message.guild.id);
            const { fixedLinks, items } = await bot.linkFixer.process(message.content, settings);

            if (fixedLinks.length === 0 || items.length === 0) return false;

            const containers = [];

            for (const item of items.slice(0, 5)) {
                const og = await bot.linkFixer.fetchOGMetadata(item.fixedUrl);

                // Validation: Only create card if valid content exists
                const hasContent = (og && (og.title || og.description || og.image || og.video));
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

                const payload = {
                    components: containers,
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: { parse: [] }
                };

                const sentMessage = await message.reply(payload).catch(() => null);

                if (sentMessage) {
                    bot.linkFixer.trackFixedMessage(sentMessage.id, {
                        authorId: message.author.id,
                        guildId: message.guild.id,
                        channelId: message.channel.id,
                        originalContent: message.content,
                        fixedLinks,
                        items
                    });
                }
                return true;
            } else {
                console.log('[LinkFixHandler] No valid metadata content found for links in message, ignoring.');
            }
        } catch (err) {
            console.error('[LinkFixHandler] Error processing links:', err.message);
        }

        return false;
    }
}

module.exports = LinkFixHandler;

