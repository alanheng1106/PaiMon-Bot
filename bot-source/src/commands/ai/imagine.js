const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imagine')
        .setDescription('透過文字描述生成一張超高清 AI 圖像！')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('你要生成的圖像描述 (英文效果優越)')
                .setRequired(true)
        ),
    async execute(interaction, bot) {
        const prompt = interaction.options.getString('prompt', true).trim();

        // 1. Input Validation
        if (!prompt || prompt.length === 0) {
            return bot.sendError(interaction, '輸入無效', '請輸入具體的圖像描述! 不能發送空白內容');
        }
        if (prompt.length > 1000) {
            return bot.sendError(interaction, '提示詞過長', '圖像描述不能超過 1000 個字元! 請試著簡化你的問題');
        }

        await interaction.deferReply();

        try {
            const imageBuffer = await bot.ai.generateImage(prompt);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'canvas.jpg' });

            const embed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle(`🎨 你的夢境畫作：`)
                .setDescription(`*${prompt}*`)
                .setImage('attachment://canvas.jpg')
                .setFooter({ text: `Requested by: ${interaction.user.username} • Model: SDXL 1.0` })
                .addFields(
                    { name: '💡 提示', value: '使用更豐富的形容詞 (如 dynamic lighting, 8k) 可以得到更好的效果!', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], files: [attachment] });

        } catch (error) {
            console.warn('[Command: imagine]', error.message);
            if (!bot.ai.imageReady || error.message.includes('missing')) {
                return bot.sendError(interaction, '核心未授權', '未偵測到 `HF_TOKEN`，人工智慧模組已被安全隔離');
            }
            if (error.message.toLowerCase().includes('safety') || error.message.toLowerCase().includes('nsfw')) {
                return bot.sendError(interaction, '審查攔截', '你的提示詞觸發了 AI 內容安全過濾機制! 請嘗試更換描述');
            }
            if (error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('busy') || error.message.includes('503')) {
                return bot.sendError(interaction, '算力負載中', '伺服器目前極度繁忙! 請稍候 30 秒再重試');
            }
            bot.sendError(interaction, '影像算繪異常', `影像算繪器發生潰散: \n\`\`\`\n${error.message}\n\`\`\``);
        }
    },
};
