const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('搜尋並加入網路高音質歌曲')
        .addStringOption((opt) => opt.setName('query').setDescription('曲名或 URL').setRequired(true)),

    category: 'music',
    cooldown: 3,
    helpText: '🔹 `/play [曲名或 URL]` - 搜尋並播放歌曲, 支援 YouTube 關鍵字或直接貼上連結 (包含播放清單)',
    async execute(interaction, bot) {
        await interaction.deferReply();
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
                '我在這個頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限, 進不去!'
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
                `我已經在 <#${botVoiceChannel.id}> 裡了, 請到同一個頻道!`
        }

        const query = interaction.options.getString('query', true).trim();

        // 1. Input Sanity Check
        if (query.length < 2) {
            return bot.sendError(interaction, '搜尋詞過短', '關鍵字至少要 2 個字!');
        }
        if (query.length > 500) {
            return bot.sendError(interaction, '搜尋詞過長', '關鍵字不能超過 500 個字!');
        }

        try {
            const { isPlaylist, name, tracks } = await bot.music.search(query);
            if (!tracks?.length) return bot.sendError(interaction, '查無結果', `找不到任何與 \`${query}\` 相符的結果`);

            if (isPlaylist) {
                await bot.music.playPlaylist(voiceChannel, interaction.channel, name, tracks, interaction.user);
                return;
            }

            if (query.startsWith('http')) {
                await bot.music.play(voiceChannel, interaction.channel, tracks[0], interaction.user);
                return;
            }

            // Interactive Selector

            const results = tracks.slice(0, 5);
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('yt_select')
                .setPlaceholder('點擊選擇想聽的歌曲...')
                .addOptions(
                    results.map((t, i) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(t.info.title.slice(0, 100))
                            .setDescription(`Author: ${t.info.author.slice(0, 50)}`)
                            .setValue(i.toString())
                    )
                );

            const container = new ContainerBuilder()
                .setAccentColor(Colors.Music)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🎶 搜尋結果`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`以下是 \`${query}\` 的搜尋結果, 請從下方選單選擇:\n\n選單將在 25 秒後失效`));

            const response = await interaction.followUp({
                components: [container, new ActionRowBuilder().addComponents(selectMenu)],
                flags: MessageFlags.IsComponentsV2
            });

            response
                .awaitMessageComponent({
                    componentType: ComponentType.StringSelect,
                    time: 25_000,
                    filter: (i) => i.user.id === interaction.user.id
                })
                .then(async (i) => {
                    const selectedTrack = results[parseInt(i.values[0])];

                    const text = new TextDisplayBuilder().setContent('⌛ **正在處理選中的歌曲, 請稍候...**');
                    const container = new ContainerBuilder().setAccentColor(Colors.Music).addTextDisplayComponents(text);

                    await i.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    await bot.music.play(voiceChannel, interaction.channel, selectedTrack, interaction.user);
                })
                .catch(() => {
                    const text = new TextDisplayBuilder().setContent('### ⏰ 選擇已超時或取消');
                    const container = new ContainerBuilder().setAccentColor(Colors.Warning).addTextDisplayComponents(text);

                    interaction
                        .editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
                        .catch((e) => console.warn('Ignored error:', e.message));
                });
        } catch (err) {
            console.error('[Play CMD]', err.message);
            bot.sendError(interaction, '播放中斷', '處理時出了點問題, 請稍後再試.');
        }
    }
};
