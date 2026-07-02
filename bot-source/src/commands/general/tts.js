const { SlashCommandBuilder } = require('discord.js');
const googleTTS = require('google-tts-api');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('使用 Google TTS 將文字轉語音並在語音頻道播放')
        .addStringOption(option => 
            option.setName('text')
                .setDescription('要轉換為語音的文字')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('語言代碼 (預設: zh-TW)')
                .setRequired(false)
                .addChoices(
                    { name: '🇹🇼 繁體中文 (zh-TW)', value: 'zh-TW' },
                    { name: '🇺🇸 英文 (en)', value: 'en' },
                    { name: '🇯🇵 日文 (ja)', value: 'ja' },
                    { name: '🇰🇷 韓文 (ko)', value: 'ko' },
                    { name: '🇨🇳 簡體中文 (zh-CN)', value: 'zh-CN' },
                    { name: '🇫🇷 法文 (fr)', value: 'fr' },
                    { name: '🇪🇸 西班牙文 (es)', value: 'es' }
                )
        ),
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音錯誤', '你必須先加入一個語音頻道！');

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
            return bot.sendError(interaction, '權限被拒絕', '我在此頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限！');
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(interaction, '不在同一頻道', `我已經在一個語音頻道（<#${botVoiceChannel.id}>）中！`);
        }

        const text = interaction.options.getString('text', true).trim();
        const lang = interaction.options.getString('lang') || 'zh-TW';

        if (text.length > 200) {
            return bot.sendError(interaction, '字數過長', '文字不能超過 200 個字元！');
        }

        await interaction.deferReply();

        try {
            const url = googleTTS.getAudioUrl(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
            });

            const { tracks } = await bot.music.search(url);
            if (!tracks?.length) {
                return bot.sendError(interaction, 'TTS 錯誤', '無法生成語音。');
            }

            const track = tracks[0];
            track.info.title = `TTS: ${text}`;
            track.info.author = `Language: ${lang}`;

            await bot.music.play(voiceChannel, interaction.channel, track, interaction.user, { isTTS: true });
            
            await bot.sendSuccess(interaction, '🗣️ 文字轉語音', `**內容：** ${text}\n**語言：** ${lang}`);

        } catch (error) {
            console.error('[TTS CMD]', error.message);
            bot.sendError(interaction, 'TTS 錯誤', `發生錯誤: \`${error.message}\``);
        }
    }
};
