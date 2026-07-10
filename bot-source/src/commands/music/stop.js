const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('stop').setDescription('停止播放並清空佇列'),
    category: 'music',
    helpText: '🔹 `/stop` - 停止播放並清空所有佇列中的歌曲（同時重置循環模式）',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前不在任何語音頻道!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能停止音樂!`
            );
        }

        bot.music.stop(interaction.guild.id);

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <a:check:1524601509772529665> 停止播放'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('播放已停止且佇列已清空'));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
