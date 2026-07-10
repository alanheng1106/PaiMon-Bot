const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('檢查核心系統延遲'),
    category: 'general',
    helpText: '🔹 `/ping` - 查看機器人目前的 WebSocket 與回應延遲',
    async execute(interaction, bot) {
        const text = new TextDisplayBuilder().setContent('🔍 正在偵測系統延遲...');
        const initialContainer = new ContainerBuilder().setAccentColor(Colors.Info).addTextDisplayComponents(text);

        await interaction.reply({ components: [initialContainer], flags: MessageFlags.IsComponentsV2 });
        const sent = await interaction.fetchReply();
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(bot.ws.ping);

        // Pick color token based on latency thresholds
        let color = Colors.Success;
        if (latency > 200) color = Colors.Warning;
        if (latency > 500) color = Colors.Error;

        const content = `**📡 網關連線 (WebSocket)**\n\`${apiLatency}ms\`\n\n**🌐 核心回應 (Roundtrip)**\n\`${latency}ms\``;
        const container = new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 系統延遲回報`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
