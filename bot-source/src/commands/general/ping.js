const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('檢查核心系統延遲'),
    category: 'general',
    helpText: '🔹 `/ping` - 查看機器人目前的 WebSocket 與回應延遲',
    async execute(interaction, bot) {
        const text = new TextDisplayBuilder().setContent('🔍 正在偵測系統延遲...');
        const initialContainer = new ContainerBuilder().setAccentColor(Colors.Primary).addTextDisplayComponents(text);

        const sent = await interaction.reply({ components: [initialContainer], flags: MessageFlags.IsComponentsV2, fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(bot.ws.ping);

        // Pick color token based on latency thresholds
        let color = Colors.Success;
        if (latency > 200) color = Colors.Warning;
        if (latency > 500) color = Colors.Error;

        const content = `### 🏓 系統延遲回報\n\n**📡 網關連線 (WebSocket)**\n\`${apiLatency}ms\`\n\n**🌐 核心回應 (Roundtrip)**\n\`${latency}ms\``;
        const resultText = new TextDisplayBuilder().setContent(content);
        const container = new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(resultText);

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
