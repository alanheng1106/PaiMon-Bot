const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');

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
        const avatarUrl = targetUser.displayAvatarURL({ size: 1024 });

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🖼️ ${targetUser.tag} 的大頭貼`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`[點此下載/查看原始解析度圖片](${avatarUrl})`))
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl))
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
