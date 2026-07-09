const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const os = require('os');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('about').setDescription('關於系統'),
    category: 'general',
    helpText: '🔹 `/about` - 顯示機器人的系統狀態、運行時長與資源使用情況',
    async execute(interaction, bot) {
        const generateContainer = (disabled = false) => {
            // Process Stats
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const uptimeStr = days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;

            // System Stats
            const totalMem = (os.totalmem() / 1024 ** 3).toFixed(2);
            const usedMem = ((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2);
            const cpuModel = os.cpus()[0].model.replace(/\s+/g, ' ').trim();
            const osPlatform = os.platform() === 'linux' ? 'Linux' : os.platform() === 'win32' ? 'Windows' : os.platform();

            // Bot Stats
            const content = `**👤 身份標識**\n${bot.user.tag}\n\n**⏱️ 運行時長**\n${uptimeStr}\n\n**📡 伺服器數量**\n${bot.guilds.cache.size} Guilds\n\n**🖥️ 執行環境**\nNode.js ${process.version} / ${osPlatform}\n\n**📟 處理器 (CPU)**\n\`${cpuModel}\`\n\n**📊 記憶體 (RAM)**\n${usedMem} GB / ${totalMem} GB`;

            const refreshButton = new ButtonBuilder()
                .setCustomId('refresh_about')
                .setLabel('重新整理')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled);

            return new ContainerBuilder()
                .setAccentColor(Colors.Primary)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🤖 系統資訊`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(bot.user.displayAvatarURL({ extension: 'png', size: 1024 })))
                )
                .addActionRowComponents(new ActionRowBuilder().addComponents(refreshButton));
        };

        await interaction.reply({ components: [generateContainer()], flags: MessageFlags.IsComponentsV2 });
        const response = await interaction.fetchReply();
        
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300_000 // 5 minutes timeout
        });
        
        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '您不能使用這個按鈕哦！請自己輸入 `/about`。', ephemeral: true });
            }
            if (i.customId === 'refresh_about') {
                await i.update({ components: [generateContainer()], flags: MessageFlags.IsComponentsV2 });
            }
        });
        
        collector.on('end', () => {
            interaction.editReply({ components: [generateContainer(true)], flags: MessageFlags.IsComponentsV2 }).catch(e => console.warn('Ignored error:', e.message));
        });
    }
};
