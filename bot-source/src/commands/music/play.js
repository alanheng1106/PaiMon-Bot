const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('搜尋並加入網路高音質歌曲')
        .addStringOption(opt => opt.setName('query').setDescription('曲名或 URL').setRequired(true)),

    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
            return bot.sendError(interaction, '權限被拒絕', '我在此頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限, 無法進入!');
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `我已經在一個語音頻道（<#${botVoiceChannel.id}>）中了, 請跟我到同一個頻道!`);
        }

        const query = interaction.options.getString('query', true).trim();

        // 1. Input Sanity Check
        if (query.length < 2) {
            return bot.sendError(interaction, '搜尋詞過短', '請輸入至少 2 個字元以進行有效的搜尋!');
        }
        if (query.length > 500) {
            return bot.sendError(interaction, '搜尋詞過長', '搜尋關鍵字不能超過 500 個字元! 請精簡你的提示');
        }

        await interaction.deferReply();

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
            const { EmbedBuilder } = require('discord.js');
            const { Colors } = require('../../config');

            const results = tracks.slice(0, 5);
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('yt_select')
                .setPlaceholder('點擊選擇想聽的歌曲...')
                .addOptions(results.map((t, i) => new StringSelectMenuOptionBuilder()
                    .setLabel(t.info.title.slice(0, 100))
                    .setDescription(`Author: ${t.info.author.slice(0, 50)}`)
                    .setValue(i.toString())
                ));

            const selectorEmbed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle('🔍 搜尋結果')
                .setDescription(`以下是關鍵字 \`${query}\` 的匹配項, 請從下方選單選擇: `)
                .setFooter({ text: '選單將在 25 秒後失效' });

            const response = await interaction.followUp({
                embeds: [selectorEmbed],
                components: [new ActionRowBuilder().addComponents(selectMenu)],
            });

            response.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                time: 25_000,
                filter: i => i.user.id === interaction.user.id
            }).then(async i => {
                const selectedTrack = results[parseInt(i.values[0])];

                const loadingEmbed = new EmbedBuilder()
                    .setColor(Colors.Primary)
                    .setDescription('⌛ **正在處理選中的歌曲，請稍待片刻...**');

                await i.update({ embeds: [loadingEmbed], components: [] });
                await bot.music.play(voiceChannel, interaction.channel, selectedTrack, interaction.user);
            }).catch(() => {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(Colors.Error)
                    .setDescription('❌ **選擇已超時或取消**');

                interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => { });
            });

        } catch (err) {
            console.error('[Play CMD]', err.message);
            bot.sendError(interaction, '播放中斷', `發生阻礙: \`${err.message}\``);
        }
    },
};
