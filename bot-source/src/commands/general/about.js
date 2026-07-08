const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const os = require('os');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('about').setDescription('關於系統'),
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
        const totalMem = (os.totalmem() / 1024 ** 3).toFixed(2);
        const usedMem = ((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2);
        const cpuModel = os.cpus()[0].model.replace(/\s+/g, ' ').trim();
        const osPlatform = os.platform() === 'linux' ? 'Linux' : os.platform() === 'win32' ? 'Windows' : os.platform();

        // Bot Stats
        const commandCount = bot.commands.size;
        const musicNode = bot.music.shoukaku.nodes.size > 0 ? '✅ 已連線' : '❌ 離線';
        const lavaNode = [...bot.music.shoukaku.nodes.values()][0];
        const nodePing = lavaNode ? `${lavaNode.stats?.ping ?? '?'}ms` : 'N/A';

        const content = `### 🤖 系統資訊\n基於 Discord.js 核心設計的音樂 & TTS 機器人\n\n**👤 身份標識**\n${bot.user.tag}\n\n**⏱️ 運行時長**\n${uptimeStr}\n\n**📡 伺服器數量**\n${bot.guilds.cache.size} Guilds\n\n**🎵 音樂節點**\n${musicNode}\n\n**🏓 節點延遲**\n${nodePing}\n\n**📜 已載入指令**\n${commandCount} 個\n\n**🖥️ 執行環境**\nNode.js ${process.version} / ${osPlatform}\n\n**📟 處理器 (CPU)**\n\`${cpuModel}\`\n\n**📊 記憶體 (RAM)**\n${usedMem} GB / ${totalMem} GB\n\n由 HaeImDuck 製作`;

        const text = new TextDisplayBuilder().setContent(content);
        const container = new ContainerBuilder().setAccentColor(Colors.Primary).addTextDisplayComponents(text);

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
