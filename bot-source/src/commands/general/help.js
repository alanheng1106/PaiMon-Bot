const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { Colors } = require('../../config');

const CATEGORY_META = {
    music:   { label: '🎶 音樂模組 (Music)',      emoji: '🎶', description: '音樂播放與控制相關指令' },
    admin:   { label: '⚔️ 管理工具 (Admin)',       emoji: '⚔️', description: '伺服器與成員管理指令' },
    owner:   { label: '👑 擁有者工具 (Owner)',     emoji: '👑', description: '機器人擁有者專屬指令' },
    general: { label: '⚙️ 核心系統 (General)',     emoji: '⚙️', description: '基礎功能與狀態查詢指令' },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('顯示所有可用指令與詳細說明'),
    category: 'general',
    helpText: '🔹 `/help` - 開啟互動式指令手冊，選擇類別查看詳細說明',
    async execute(interaction, bot) {

        const generateHomeEmbed = () => {
            const categoryList = Object.values(CATEGORY_META)
                .map(m => `${m.emoji} **${m.label}**`)
                .join('\n');

            return new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle('📖 指令手冊 - 首頁')
                .setDescription(`歡迎使用指令手冊！請從下方選單選擇想了解的類別。\n\n**可用類別：**\n${categoryList}`)
                .setFooter({ text: '由 HaeImDuck 製作', iconURL: bot.user.displayAvatarURL() })
                .setTimestamp();
        };

        const generateCategoryEmbed = (category) => {
            const meta = CATEGORY_META[category];
            if (!meta) return generateHomeEmbed();

            // Dynamically build command list from loaded commands
            const commands = [...bot.commands.values()].filter(cmd => cmd.category === category);
            const description = commands.length === 0
                ? '此類別目前沒有可用指令。'
                : commands.map(cmd => cmd.helpText ?? `🔹 \`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n');

            return new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle(meta.label)
                .setDescription(description)
                .setFooter({ text: '由 HaeImDuck 製作', iconURL: bot.user.displayAvatarURL() })
                .setTimestamp();
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
                    emoji: meta.emoji,
                })),
            ]);

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            embeds: [generateHomeEmbed()],
            components: [actionRow],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 120_000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '您不能使用這個選單哦！請自己輸入 `/help` 來開啟。', ephemeral: true });
            }

            const selected = i.values[0];
            const embed = selected === 'home' ? generateHomeEmbed() : generateCategoryEmbed(selected);
            await i.update({ embeds: [embed] });
        });

        collector.on('end', () => {
            selectMenu.setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(selectMenu);
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
