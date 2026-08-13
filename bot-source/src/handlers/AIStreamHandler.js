const { AttachmentBuilder } = require('discord.js');
const BaseMessageHandler = require('../pipeline/BaseMessageHandler');
const DiscordStreamUpdater = require('../core/ai/DiscordStreamUpdater');
const { AI: AIConfig } = require('../config');

/**
 * AIStreamHandler — Handles chunk-by-chunk AI streaming responses, typing indicators, and file attachment delivery.
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
            const responseResult = await bot.ai.generateResponse(
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

            let finalReplyText = typeof responseResult === 'object' ? responseResult.text : responseResult;
            let attachments = typeof responseResult === 'object' ? (responseResult.attachments || []) : [];

            // Fallback: If no tool generated attachments, check if user explicitly requested a file download
            if (attachments.length === 0) {
                attachments = this.#extractFallbackAttachments(userMessage, finalReplyText);
            }

            const files = attachments.map((att) => {
                return new AttachmentBuilder(Buffer.from(att.content, 'utf-8'), { name: att.filename });
            });

            // 3. Finalize response cleanly with attachments
            if (streamUpdater) {
                await streamUpdater.finalize(finalReplyText, files);
            } else if (aiMessage) {
                const payload = {
                    content: finalReplyText,
                    allowedMentions: { parse: [] }
                };
                if (files.length > 0) payload.files = files;
                await aiMessage.edit(payload);
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

    /**
     * Extracts attachments from code blocks if user's prompt explicitly requested file saving/downloading.
     * @param {string} userPrompt 
     * @param {string} replyText 
     * @returns {Array<{filename: string, content: string}>}
     */
    #extractFallbackAttachments(userPrompt, replyText) {
        if (!userPrompt || !replyText) return [];

        const isFileRequest = /(?:存成|輸出成|下載|生成|打包).*(?:檔|文件|\.py|\.js|\.json|\.txt|\.html|\.md|\.css|\.csv)/i.test(userPrompt);
        if (!isFileRequest) return [];

        const codeBlockRegex = /```(?:(\w+)\r?\n)?([\s\S]*?)```/g;
        const attachments = [];
        let match;
        let index = 1;

        while ((match = codeBlockRegex.exec(replyText)) !== null) {
            const lang = match[1] || 'txt';
            const code = match[2].trim();
            if (!code) continue;

            const filenameMatch = code.match(/^(?:#|\/\/|\/\*|<!--)\s*([\w.-]+\.\w+)/m);
            let filename = filenameMatch ? filenameMatch[1] : null;

            if (!filename) {
                const extMap = {
                    python: 'py', py: 'py',
                    javascript: 'js', js: 'js',
                    typescript: 'ts', ts: 'ts',
                    html: 'html', css: 'css',
                    json: 'json', markdown: 'md', md: 'md',
                    bash: 'sh', sh: 'sh', csv: 'csv'
                };
                const ext = extMap[lang.toLowerCase()] || lang.toLowerCase();
                filename = `generated_file_${index}.${ext}`;
            }

            attachments.push({
                filename,
                content: code
            });
            index++;
        }

        return attachments;
    }
}

module.exports = AIStreamHandler;
