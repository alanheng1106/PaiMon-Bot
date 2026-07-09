const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ttschannel')
        .setDescription('設定自動語音 (TTS) 的專屬文字頻道')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('綁定一個文字頻道作為自動 TTS 頻道')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('要綁定的文字頻道')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('lang')
                        .setDescription('預設播放語言 (預設: zh-TW)')
                        .setRequired(false)
                        .addChoices(
                            { name: '🇹🇼 繁體中文 (zh-TW)', value: 'zh-TW' },
                            { name: '🇺🇸 英文 (en)', value: 'en' },
                            { name: '🇯🇵 日文 (ja)', value: 'ja' },
                            { name: '🇰🇷 韓文 (ko)', value: 'ko' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('解除綁定自動 TTS 頻道')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'admin',
    helpText: '🔹 `/ttschannel set [頻道]` - 綁定自動 TTS 頻道\n🔹 `/ttschannel remove` - 解除綁定自動 TTS 頻道',
    async execute(interaction, bot) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');
            const lang = interaction.options.getString('lang') || 'zh-TW';

            // Store in bot.settings
            const ttsSettings = bot.settings.get(interaction.guild.id, 'tts') || {};
            ttsSettings.channelId = channel.id;
            ttsSettings.lang = lang;
            bot.settings.set(interaction.guild.id, 'tts', ttsSettings);

            const container = new ContainerBuilder()
                .setAccentColor(Colors.Success)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 自動 TTS 頻道已設定`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<a:check:1524601509772529665> 已將 <#${channel.id}> 設為自動語音頻道。\n**語言**：\`${lang}\``));

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else if (subcommand === 'remove') {
            bot.settings.set(interaction.guild.id, 'tts', null);

            const container = new ContainerBuilder()
                .setAccentColor(Colors.Success)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <a:check:1524601509772529665> 自動 TTS 頻道已解除'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:check:1524601509772529665> 伺服器已解除綁定自動語音頻道。'));

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
