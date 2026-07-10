const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');
const { getAverageColor } = require('fast-average-color-node');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('取得使用者的大頭貼')
        .addUserOption((option) =>
            option.setName('user').setDescription('選擇一位使用者 (若未選擇則顯示自己的)').setRequired(false)
        ),
    category: 'general',
    helpText: '🔹 `/avatar [使用者]` - 檢視並取得使用者的大尺寸大頭貼',
    async execute(interaction, bot) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Fetch high-resolution avatar URL
        const avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });

        let accentColor = Colors.Info;
        try {
            const colorData = await getAverageColor(avatarUrl);
            if (colorData && colorData.hex) {
                accentColor = parseInt(colorData.hex.slice(1), 16);
            }
        } catch (err) {
            // Ignore color extraction errors
        }

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🖼️ ${targetUser.tag} 的大頭貼`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl))
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('下載 / 查看原圖')
                        .setStyle(ButtonStyle.Link)
                        .setURL(avatarUrl)
                )
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
