const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('關於系統'),
    async execute(interaction, bot) {
        // Process Stats
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const uptimeStr = days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;

        // System Stats
        const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
        const usedMem = ((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(2);
        const cpuModel = os.cpus()[0].model.replace(/\s+/g, ' ').trim();
        const osPlatform = os.platform() === 'win32' ? 'Windows' : os.platform() === 'linux' ? 'Linux' : os.platform();

        // AI Model Formatting
        const llmName = bot.ai.model.split(':')[0].toUpperCase();
        const imgName = bot.ai.imageModel.toLowerCase().includes('stable-diffusion-xl') ? 'SDXL' : bot.ai.imageModel.split('/').pop().toUpperCase();

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('🤖 系統資訊')
            .setDescription('基於 Discord.js 核心設計的音樂兼 AI 機器人')
            .addFields(
                { name: '👤 我的標識', value: bot.user.tag, inline: true },
                { name: '⏱️ 運行時長', value: uptimeStr, inline: true },
                { name: '🧠 AI 模型', value: `${llmName} & ${imgName}`, inline: true },
                { name: '📡 伺服器數量', value: `${bot.guilds.cache.size} Guilds`, inline: true },
                { name: '🖥️ 內核', value: `Node.js ${process.version}`, inline: true },
                { name: '🌐 主機平台', value: osPlatform, inline: true },
                { name: '📟 處理器 (CPU)', value: `\`${cpuModel}\``, inline: false },
                { name: '📊 記憶體 (RAM)', value: `${usedMem} GB / ${totalMem} GB`, inline: true }
            )
            .setFooter({ text: '由 HaeImDuck 製作' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
