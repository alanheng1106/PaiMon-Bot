const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('登入 Valorant 帳號以查看每日商店 (網址授權登入)'),
    category: 'valorant',
    async execute(interaction, bot) {
        const authUrl =
            'https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=1&scope=account%20openid';

        const content = `為了突破 Riot 防火牆限制並支援手機推播驗證，我們採用最安全的官方網頁授權方式：\n\n1️⃣ 點擊下方 **[前往官方登入]** 按鈕，在瀏覽器完成登入。\n2️⃣ 登入成功後，網頁會跳轉成一個**空白頁面**。\n3️⃣ 複製該空白頁面的**完整網址** (包含 \`#access_token=...\`)。\n4️⃣ 點擊下方 **[貼上授權網址]** 按鈕，並將網址貼上。\n\n⚠️ 注意：授權大約 1 小時後過期，過期需重新點擊登入。\n\n安全提示：我們不會儲存您的帳號與密碼。`;
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Valorant)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔐 Valorant 帳號登入 (安全連線)`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('前往官方登入').setURL(authUrl).setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setCustomId('valUrlLoginBtn')
                .setLabel('貼上授權網址')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋')
        );

        await interaction.reply({
            components: [container, row],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
    }
};
