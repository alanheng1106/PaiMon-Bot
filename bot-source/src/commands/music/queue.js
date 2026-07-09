const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('queue').setDescription('查看當前播放列表'),
    category: 'music',
    helpText: '🔹 `/queue` - 顯示目前播放佇列（最多顯示 10 首）與紽計資訊',
    async execute(interaction, bot) {
        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲在播放');

        const currentSong = queue.songs[0];
        const songs = queue.songs;
        const totalDurationMs = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

        const trackList = songs
            .slice(0, 10)
            .map((s, i) => {
                const timeStr = bot.music.formatDuration(s.duration);
                const title = s.title.length > 50 ? s.title.slice(0, 47) + '...' : s.title;
                const prefix = i === 0 ? '▶️ **[正在播放]**' : `**${i}.**`;
                return `${prefix} ${title} \`[${timeStr}]\` - <@${s.requester.id}>`;
            })
            .join('\n');

        let footerText = '';
        if (songs.length > 10) {
            footerText = `\n\n以及還有 ${songs.length - 10} 首歌曲...`;
        }

        const content = `${trackList}\n\n**📊 統計資料**\n總共: **${songs.length}** 首歌 | 總時長: **${bot.music.formatDuration(totalDurationMs)}**${footerText}`;
        
        const thumbnail = new ThumbnailBuilder().setURL(currentSong.thumbnail);
        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 當前播放清單`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(thumbnail);
        const container = new ContainerBuilder().setAccentColor(Colors.Primary).addSectionComponents(section);

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
