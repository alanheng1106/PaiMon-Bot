const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('pause').setDescription('暫停當前正在播放的歌曲'),
    category: 'music',
    helpText: '🔹 `/pause` - 暫停目前播放的歌曲',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道才能暫停歌曲!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以暫停');

        bot.music.pause(interaction.guild.id);

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### ⏸️ 播放暫停'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('音樂播放已成功暫停'));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
