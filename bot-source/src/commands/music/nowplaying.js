const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription('顯示當前正在播放的歌曲'),
    category: 'music',
    helpText: '🔹 `/nowplaying` - 查看目前正在播放的歌曲資訊與播放進度',
    async execute(interaction, bot) {
        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '無播放內容', '當前沒有正在播放的歌曲');

        const currentSong = queue.songs[0];
        const player = queue.player;

        const content = `**${currentSong.title}**\n\n**👤 歌手**\n${currentSong.author}\n\n**⏱️ 時長**\n${bot.music.formatDuration(currentSong.duration)}\n\n**📥 點播者**\n<@${currentSong.requester.id}>\n\n**📊 播放進度**\n${bot.music.createProgressBar(player.position, currentSong.duration)}\n\nRequested by ${currentSong.requester.tag}`;
        const thumbnail = new ThumbnailBuilder().setURL(currentSong.thumbnail);
        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 正在播放`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(thumbnail);
            
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addSectionComponents(section)
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🔗 前往播放來源')
                        .setStyle(ButtonStyle.Link)
                        .setURL(currentSong.url)
                )
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
