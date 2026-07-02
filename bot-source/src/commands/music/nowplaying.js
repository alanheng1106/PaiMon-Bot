const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('顯示當前正在播放的歌曲'),
    category: 'music',
    helpText: '🔹 `/nowplaying` - 查看目前正在播放的歌曲資訊與播放進度',
    async execute(interaction, bot) {
        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '無播放內容', '當前沒有正在播放的歌曲');

        const currentSong = queue.songs[0];
        const player = queue.player;

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('▶️ 正在播放')
            .setDescription(`**[${currentSong.title}](${currentSong.url})**`)
            .setThumbnail(currentSong.thumbnail)
            .addFields(
                { name: '👤 歌手', value: currentSong.author, inline: true },
                { name: '⏱️ 時長', value: bot.music.formatDuration(currentSong.duration), inline: true },
                { name: '📥 點播者', value: `<@${currentSong.requester.id}>`, inline: true },
                { name: '📊 播放進度', value: bot.music.createProgressBar(player.position, currentSong.duration), inline: false }
            )
            .setFooter({ text: `Requested by ${currentSong.requester.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
