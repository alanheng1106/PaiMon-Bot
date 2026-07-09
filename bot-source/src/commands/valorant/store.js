const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const { Colors } = require('../../config');
const StoreCanvas = require('../../core/StoreCanvas');

module.exports = {
    data: new SlashCommandBuilder().setName('store').setDescription('查看你的 Valorant 每日商店'),
    category: 'valorant',
    helpText: '🔹 `/store` - 查看你的 Valorant 每日商店造型與價格',

    async execute(interaction, bot) {
        const userId = interaction.user.id;
        const sessions = bot.valorant.getSessions(userId);

        if (!sessions) {
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Error)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <:cross:1524603300752785550> 尚未登入'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('你還沒有登入任何 Riot 帳號。\n請先使用 `/login` 登入。'));
            return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        }

        const riotIds = Object.keys(sessions);

        if (riotIds.length === 1) {
            // Single account — query directly
            await interaction.deferReply();
            return this._showStore(interaction, bot, userId, riotIds[0]);
        }

        // Multiple accounts — show select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('val_store_select')
            .setPlaceholder('選擇要查詢的帳號...')
            .addOptions(
                riotIds.map((id) => ({
                    label: id,
                    value: id,
                    emoji: '🎮'
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Valorant)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### 🎮 選擇帳號'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('你有多個已登入的 Riot 帳號，請選擇要查詢的帳號：'));

        await interaction.reply({
            components: [container, row],
            flags: MessageFlags.IsComponentsV2
        });
        const response = await interaction.fetchReply();

        try {
            const selection = await response.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === userId,
                time: 30_000
            });

            await selection.deferUpdate();
            await interaction.editReply({ components: [] });
            await this._showStore(interaction, bot, userId, selection.values[0]);
        } catch {
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Warning)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### ⏳ 操作逾時'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('未在時間內選擇帳號，請重新使用 `/store`。'));
            await interaction
                .editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
                .catch((e) => console.warn('Ignored error:', e.message));
        }
    },

    /**
     * Query and display the daily store for a specific account.
     */
    async _showStore(interaction, bot, discordUserId, riotId) {
        try {
            // Get valid session (auto-refreshes if expired)
            const session = await bot.valorant.getValidSession(discordUserId, riotId);

            if (!session) {
                const container = new ContainerBuilder()
                    .setAccentColor(Colors.Error)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔒 Session 已過期`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`帳號 **${riotId}** 的登入已過期，請重新使用 \`/login\` 登入。`));

                if (interaction.deferred) return interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            // Query storefront
            const storefront = await bot.valorant.getStorefront(session);
            const skinUuids = storefront.skinUuids;

            if (!skinUuids || skinUuids.length === 0) {
                const container = new ContainerBuilder()
                    .setAccentColor(Colors.Warning)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### ⚠️ 商店資料異常'))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('無法取得每日商店資料，請稍後再試。'));
                
                if (interaction.deferred) return interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            // Get prices and skin details in parallel
            const prices = storefront.prices;
            const skins = await bot.valorant.getSkinDetails(skinUuids);

            // Calculate remaining time
            const remaining = storefront.remainingSeconds;
            // Prepare skins array with price data
            const skinsData = skins.map((s) => {
                const price = prices.get(s.uuid.toLowerCase()) || prices.get(s.uuid);
                return {
                    uuid: s.uuid,
                    displayName: s.displayName,
                    displayIcon: s.displayIcon,
                    tierName: s.tierName,
                    tierColor: s.tierColor,
                    price: price
                };
            });

            // Generate Canvas Image
            const buffer = await StoreCanvas.generateStoreImage(skinsData, storefront.remainingSeconds);
            const attachment = new AttachmentBuilder(buffer, { name: 'store.png' });

            const mediaGallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://store.png'));
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Valorant)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🎮 ${riotId} 的每日商店`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addMediaGalleryComponents(mediaGallery);

            const payload = { components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 };

            if (interaction.deferred) {
                await interaction.followUp(payload);
            } else {
                await interaction.editReply(payload);
            }
        } catch (err) {
            console.error('[Valorant] Store query failed:', err);
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Error)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:cross:1524603300752785550> 查詢失敗`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`無法查詢 **${riotId}** 的商店：\n\`${err.message}\`\n\n請嘗試重新 \`/login\` 登入。`));

            if (interaction.deferred) {
                await interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
};
