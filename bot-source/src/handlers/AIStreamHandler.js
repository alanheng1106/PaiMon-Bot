const BaseMessageHandler = require('../pipeline/BaseMessageHandler');

/**
 * AIStreamHandler — Handles chunk-by-chunk AI streaming responses, typing indicators, and placeholder message editing.
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

        let lastEditTime = 0;
        let isRequestingDiscord = false;
        const EDIT_THROTTLE_MS = 2000;

        try {
            const userName = message.member?.displayName || message.author.username;

            let images = [];
            if (imageAttachments.size > 0 && bot.ai) {
                for (const attachment of imageAttachments.values()) {
                    const base64 = await bot.ai.urlToBase64(attachment.url);
                    if (base64) images.push(base64);
                }
            }

            // 2. Call generateResponse and stream chunk updates to placeholder message
            const finalReply = await bot.ai.generateResponse(
                userMessage,
                message.channel.id,
                userName,
                async (currentText) => {
                    const now = Date.now();

                    // Throttle: Only update Discord at most once every EDIT_THROTTLE_MS to avoid rate limits
                    if (now - lastEditTime > EDIT_THROTTLE_MS && !isRequestingDiscord && currentText.trim()) {
                        lastEditTime = now;
                        isRequestingDiscord = true;

                        try {
                            if (aiMessage) {
                                await aiMessage.edit({
                                    content: currentText + ' ✍️',
                                    allowedMentions: { parse: [] }
                                });
                            }
                        } catch (e) {
                            console.error('[AIStreamHandler] Discord Edit Error:', e.message);
                        } finally {
                            isRequestingDiscord = false;
                        }
                    }
                },
                images
            );

            // 3. Apply final complete response without typing icon
            if (aiMessage) {
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
                    .edit({ content: '抱歉，我思考的時候短路了！😵‍💫', allowedMentions: { parse: [] } })
                    .catch((e) => console.warn('Ignored error:', e.message));
            } else {
                message
                    .reply('抱歉，我思考的時候短路了！😵‍💫')
                    .catch((e) => console.warn('Ignored error:', e.message));
            }
            return true;
        }
    }
}

module.exports = AIStreamHandler;

