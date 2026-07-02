const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('關於系統'),
    category: 'general',
    helpText: '🔹 `/about` - 顯示機器人的系統狀態、運行時長與資源使用情況',
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
        const osPlatform = os.platform() === 'linux' ? 'Linux' : os.platform() === 'win32' ? 'Windows' : os.platform();

        // Bot Stats
        const commandCount = bot.commands.size;
        const musicNode = bot.music.shoukaku.nodes.size > 0 ? '✅ 已連線' : '❌ 離線';
        const lavaNode = [...bot.music.shoukaku.nodes.values()][0];
        const nodePing = lavaNode ? `${lavaNode.stats?.ping ?? '?'}ms` : 'N/A';

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('🤖 系統資訊')
            .setDescription('基於 Discord.js 核心設計的音樂 & TTS 機器人')
            .addFields(
                { name: '👤 身份標識', value: bot.user.tag, inline: true },
                { name: '⏱️ 運行時長', value: uptimeStr, inline: true },
                { name: '📡 伺服器數量', value: `${bot.guilds.cache.size} Guilds`, inline: true },
                { name: '🎵 音樂節點', value: musicNode, inline: true },
                { name: '🏓 節點延遲', value: nodePing, inline: true },
                { name: '📜 已載入指令', value: `${commandCount} 個`, inline: true },
                { name: '🖥️ 執行環境', value: `Node.js ${process.version} / ${osPlatform}`, inline: false },
                { name: '📟 處理器 (CPU)', value: `\`${cpuModel}\``, inline: false },
                { name: '📊 記憶體 (RAM)', value: `${usedMem} GB / ${totalMem} GB`, inline: true }
            )
            .setFooter({ text: '由 HaeImDuck 製作' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
