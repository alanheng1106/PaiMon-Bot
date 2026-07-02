const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('停止播放並清空佇列'),
    category: 'music',
    helpText: '🔹 `/stop` - 停止播放並清空所有佇列中的歌曲（同時重置循環模式）',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道才能停止音樂!`);
        }

        bot.music.stop(interaction.guild.id);

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('⏹️ 停止播放')
            .setDescription('播放已停止且佇列已清空');

        await interaction.reply({ embeds: [embed] });
    },
};
