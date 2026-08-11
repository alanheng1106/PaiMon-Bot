const BaseMessageHandler = require('../pipeline/BaseMessageHandler');
const DiscordStreamUpdater = require('../core/ai/DiscordStreamUpdater');
const { AI: AIConfig } = require('../config');

/**
 * AIStreamHandler — Handles chunk-by-chunk AI streaming responses, typing indicators, and placeholder message editing.
 * Uses DiscordStreamUpdater to eliminate Fire-and-Forget async race conditions and 429 Rate Limits.
 */
class AIStreamHandler extends BaseMessageHandler {
    /**
     * Process direct DM or bot mention messages for AI streaming responses.
     * @param {import('discord.js').Message} message 
     * @param {Object} bot 
     * @returns {Promise<boolean>} Returns true if message was processed by AI handler
     */
    async handle(message, bot) {
        const isDM = !message.guild;
        const isMentioned = bot.user && message.mentions.has(bot.user.id);

        if (!isDM && !isMentioned) {
            // Passive Context Reading
            const userName = message.member?.displayName || message.author.username;
            if (bot.ai) {
                bot.ai.addPassiveContext(message.channel.id, userName, message.content);
            }
            return false;
        }

        let userMessage = message.content || '';
        if (isMentioned && bot.user) {
            userMessage = userMessage.replace(new RegExp(`<@!?${bot.user.id}>`), '').trim();
        } else {
            userMessage = userMessage.trim();
        }

        const imageAttachments = message.attachments.filter((a) => a.contentType?.startsWith('image/'));
        if (!userMessage && imageAttachments.size === 0) return false;

        await message.channel.sendTyping().catch((e) => console.warn('[AIStreamHandler] Typing error:', e.message));

        // 1. Send placeholder message BEFORE calling AI
        let aiMessage = await message.reply({
            content: '🤔 思考中...',
            allowedMentions: { parse: [] }
        }).catch(() => null);

        const streamUpdater = aiMessage ? new DiscordStreamUpdater(aiMessage, AIConfig.StreamThrottleMs) : null;

        try {
            const userName = message.member?.displayName || message.author.username;

            let images = [];
            if (imageAttachments.size > 0 && bot.ai) {
                const fetchPromises = Array.from(imageAttachments.values()).map((att) => bot.ai.urlToBase64(att.url));
                const results = await Promise.all(fetchPromises);
                images = results.filter(Boolean);
            }

            // 2. Call generateResponse and stream chunk updates using DiscordStreamUpdater
            const finalReply = await bot.ai.generateResponse(
                userMessage,
                message.channel.id,
                userName,
                async (currentText) => {
                    if (streamUpdater) {
                        await streamUpdater.push(currentText);
                    }
                },
                images
            );

            // 3. Finalize response cleanly
            if (streamUpdater) {
                await streamUpdater.finalize(finalReply);
            } else if (aiMessage) {
                await aiMessage.edit({
                    content: finalReply,
                    allowedMentions: { parse: [] }
                });
            }
            return true;
        } catch (error) {
            console.warn('[AIStreamHandler] Routing error:', error.message);

            if (aiMessage) {
                await aiMessage
                    .edit({ content: '抱歉，我思考的时候短路了！😵‍💫', allowedMentions: { parse: [] } })
                    .catch((e) => console.warn('Ignored error:', e.message));
            } else {
                message
                    .reply('抱歉，我思考的时候短路了！😵‍💫')
                    .catch((e) => console.warn('Ignored error:', e.message));
            }
            return true;
        }
    }
}

module.exports = AIStreamHandler;
