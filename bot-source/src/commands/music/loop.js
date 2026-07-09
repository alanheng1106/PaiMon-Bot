const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('loop').setDescription('切換循環模式 (關閉 → 單曲循環 → 佇列循環)'),
    category: 'music',
    helpText: '🔹 `/loop` - 循環切換播放模式：關閉 → 🔂 單曲循環 → 🔁 佇列循環 → 關閉',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道!`);
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue) return bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放!');

        // Cycle through loop modes: none → track → queue → none
        const modes = ['none', 'track', 'queue'];
        const currentIndex = modes.indexOf(queue.loop ?? 'none');
        const nextMode = modes[(currentIndex + 1) % modes.length];
        queue.loop = nextMode;

        const modeLabels = {
            none: '❌ 關閉',
            track: '🔂 單曲循環',
            queue: '🔁 佇列循環'
        };

        const modeText = modeLabels[nextMode];
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔁 循環模式已更改`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`當前循環模式：**${modeText}**`));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
