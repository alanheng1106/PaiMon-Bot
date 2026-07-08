const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');

const CATEGORY_META = {
    music: { label: '音樂模組 (Music)', emoji: '🎶', description: '音樂播放與控制相關指令' },
    admin: { label: '管理工具 (Admin)', emoji: '⚔️', description: '伺服器與成員管理指令' },
    owner: { label: '擁有者工具 (Owner)', emoji: '👑', description: '機器人擁有者專屬指令' },
    general: { label: '核心系統 (General)', emoji: '⚙️', description: '基礎功能與狀態查詢指令' },
    valorant: { label: '特戰英豪 (Valorant)', emoji: '🎮', description: 'Valorant 每日商店查詢' }
};

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('顯示所有可用指令與詳細說明'),
    category: 'general',
    helpText: '🔹 `/help` - 開啟互動式指令手冊，選擇類別查看詳細說明',
    async execute(interaction, bot) {
        const generateHomeEmbed = () => {
            const categoryList = Object.values(CATEGORY_META)
                .map((m) => `${m.emoji} **${m.label}**`)
                .join('\n');

            const text = new TextDisplayBuilder().setContent(`### 📖 指令手冊 - 首頁\n歡迎使用指令手冊！請從下方選單選擇想了解的類別。\n\n**可用類別：**\n${categoryList}\n\n由 HaeImDuck 製作`);
            return new ContainerBuilder().setAccentColor(Colors.Primary).addTextDisplayComponents(text);
        };

        const generateCategoryEmbed = (category) => {
            const meta = CATEGORY_META[category];
            if (!meta) return generateHomeEmbed();

            // Dynamically build command list from loaded commands
            const commands = [...bot.commands.values()].filter((cmd) => cmd.category === category);
            const description =
                commands.length === 0
                    ? '此類別目前沒有可用指令。'
                    : commands
                          .map((cmd) => cmd.helpText ?? `🔹 \`/${cmd.data.name}\` - ${cmd.data.description}`)
                          .join('\n');

            const text = new TextDisplayBuilder().setContent(`### ${meta.emoji} ${meta.label}\n${description}\n\n由 HaeImDuck 製作`);
            return new ContainerBuilder().setAccentColor(Colors.Primary).addTextDisplayComponents(text);
        };

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('點擊這裡選擇指令類別...')
            .addOptions([
                { label: '首頁 (Home)', description: '回到指令手冊首頁', value: 'home', emoji: '🏠' },
                ...Object.entries(CATEGORY_META).map(([key, meta]) => ({
                    label: meta.label,
                    description: meta.description,
                    value: key,
                    emoji: meta.emoji
                }))
            ]);

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            components: [generateHomeEmbed(), actionRow],
            flags: MessageFlags.IsComponentsV2,
            fetchReply: true
        });

        let lastContainer = generateHomeEmbed();

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 120_000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '您不能使用這個選單哦！請自己輸入 `/help` 來開啟。', ephemeral: true });
            }

            const selected = i.values[0];
            lastContainer = selected === 'home' ? generateHomeEmbed() : generateCategoryEmbed(selected);
            await i.update({ components: [lastContainer, actionRow], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', () => {
            selectMenu.setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(selectMenu);
            interaction
                .editReply({ components: [lastContainer, disabledRow], flags: MessageFlags.IsComponentsV2 })
                .catch((e) => console.warn('Ignored error:', e.message));
        });
    }
};
