const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('調整音樂播放音量')
        .addIntegerOption((option) =>
            option.setName('level').setDescription('音量大小 (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
        ),
    category: 'music',
    helpText: '🔹 `/volume [1-100]` - 調整音樂播放音量，設定值會在下次啟動時自動恢復',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道才能調整音量!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue) return bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放! 無法調整音量');

        const volume = interaction.options.getInteger('level');
        bot.music.setVolume(interaction.guild.id, volume);

        // Persist volume setting for this guild
        bot.settings.set(interaction.guild.id, 'volume', volume);

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔊 音量調整`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`播放音量已設定為 **${volume}%**`));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
