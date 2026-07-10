const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('resume').setDescription('恢復播放暫停的歌曲'),
    category: 'music',
    helpText: '🔹 `/resume` - 繼續播放暫停中的歌曲',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前不在任何語音頻道!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能恢復播放!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以恢復');

        bot.music.resume(interaction.guild.id);

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Music)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <a:check:1524601509772529665> 恢復播放'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('音樂播放已成功恢復'));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
