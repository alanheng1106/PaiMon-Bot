const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('查看當前播放列表'),
    category: 'music',
    helpText: '🔹 `/queue` - 顯示目前播放佇列（最多顯示 10 首）與紽計資訊',
    async execute(interaction, bot) {
        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲在播放');

        const currentSong = queue.songs[0];
        const songs = queue.songs;
        const totalDurationMs = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

        const trackList = songs.slice(0, 10).map((s, i) => {
            const timeStr = bot.music.formatDuration(s.duration);
            const title = s.title.length > 50 ? s.title.slice(0, 47) + '...' : s.title;
            const prefix = i === 0 ? '▶️ **[正在播放]**' : `**${i}.**`;
            return `${prefix} ${title} \`[${timeStr}]\` - <@${s.requester.id}>`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('🎶 當前播放清單')
            .setThumbnail(currentSong.thumbnail)
            .setDescription(trackList)
            .addFields(
                { name: '📊 統計資料', value: `總共: **${songs.length}** 首歌 | 總時長: **${bot.music.formatDuration(totalDurationMs)}**`, inline: false }
            );

        if (songs.length > 10) {
            embed.setFooter({ text: `以及還有 ${songs.length - 10} 首歌曲...` });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
