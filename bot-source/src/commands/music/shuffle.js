const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('隨機打亂佇列中的歌曲順序'),
    category: 'music',
    cooldown: 5,
    helpText: '🔹 `/shuffle` - 將目前佇列中的歌曲（不含正在播放的）隨機打亂',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前沒有在任何語音頻道中!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道!`);
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.songs.length <= 1) {
            return bot.sendError(interaction, '佇列不足', '佇列中至少需要 2 首歌曲才能打亂!');
        }

        // Keep currently playing song at index 0, shuffle the rest
        const current = queue.songs[0];
        const rest = queue.songs.slice(1);

        // Fisher-Yates shuffle
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }

        queue.songs = [current, ...rest];

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔀 佇列已打亂`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ 已隨機打亂 **${rest.length}** 首歌曲的播放順序`));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
