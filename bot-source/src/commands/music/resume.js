const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('恢復播放暫停的歌曲'),
    category: 'music',
    helpText: '🔹 `/resume` - 繼續播放暫停中的歌曲',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道才能恢復播放!`);
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以恢復');

        bot.music.resume(interaction.guild.id);

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('▶️ 恢復播放')
            .setDescription('音樂播放已成功恢復');

        await interaction.reply({ embeds: [embed] });
    },
};
