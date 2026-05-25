const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('歡迎詢問我任何問題! 我會使用神經網絡來回答你')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('你的問題')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('你要讓我看的圖片')
                .setRequired(false)
        ),
    async execute(interaction, bot) {
        const question = (interaction.options.getString('question') || '').trim();
        const imageAttachment = interaction.options.getAttachment('image');

        // 1. Input Validation
        if (!question && !imageAttachment) {
            return bot.sendError(interaction, '輸入無效', '請輸入具體的提問內容或上傳一張圖片!');
        }
        if (question.length > 2000) {
            return bot.sendError(interaction, '問題太長', '提問內容不能超過 2000 個字元! 請試著簡化你的問題');
        }

        await interaction.deferReply();

        try {
            let images = [];
            if (imageAttachment) {
                // Check if it's an image
                if (!imageAttachment.contentType?.startsWith('image/')) {
                    return bot.sendError(interaction, '檔案格式錯誤', '請上傳有效的圖片檔案 (PNG, JPG, WebP)!');
                }
                
                const base64 = await bot.ai.urlToBase64(imageAttachment.url);
                if (base64) images.push(base64);
            }

            const replyText = await bot.ai.generateResponse(question, interaction.channelId, interaction.user.username, null, images);

            const embed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle(`❓ ${question.slice(0, 200) || '圖片提問'}`)
                .setDescription(replyText.length > 4000 ? (replyText.slice(0, 3950) + '\n\n... (字數超過 Discord 限制)') : replyText)
                .setFooter({ text: `Powered by Ollama (${images.length > 0 ? bot.ai.visionModel : bot.ai.model})` })
                .setTimestamp();

            if (imageAttachment) {
                embed.setThumbnail(imageAttachment.url);
            }

            await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });

        } catch (error) {
            console.warn('[Command: ask]', error.message);
            if (error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('busy') || error.message.includes('503')) {
                return bot.sendError(interaction, '算力負載中', 'AI 伺服器目前排隊人數過多或正在冷卻, 請稍候 30 秒再試!');
            }
            if (error.message.toLowerCase().includes('not found')) {
                return bot.sendError(interaction, '模型未安裝', `找不到模型 \`${bot.ai.model}\`。`);
            }
            if (error.message.toLowerCase().includes('timeout')) {
                return bot.sendError(interaction, '回應逾時', 'AI 思考時間過長, 連線已被中斷! 請嘗試縮短問題內容');
            }
            bot.sendError(interaction, '神經網絡異常', `模型運算時發生潰散: \n\`\`\`\n${error.message}\n\`\`\``);
        }
    },
};
