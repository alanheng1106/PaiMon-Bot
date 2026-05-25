const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('檢查核心系統延遲'),
    async execute(interaction, bot) {
        const { EmbedBuilder } = require('discord.js');
        const { Colors } = require('../../config');

        const initialEmbed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setDescription('🔍 正在偵測系統延遲...');

        const sent = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(bot.ws.ping);

        let color = 0x57F287; // Green
        if (latency > 200) color = 0xFEE75C; // Yellow
        if (latency > 500) color = 0xED4245; // Red

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🏓 系統延遲回報')
            .addFields(
                { name: '📡 網關連線 (WebSocket)', value: `\`${apiLatency}ms\``, inline: true },
                { name: '🌐 核心回應 (Roundtrip)', value: `\`${latency}ms\``, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
