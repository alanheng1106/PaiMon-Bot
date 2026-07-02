const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('顯示所有可用指令與詳細說明'),
    async execute(interaction, bot) {
        // 定義每個分類的指令內容
        const categories = {
            home: {
                title: '📖 指令手冊 - 首頁',
                description: '歡迎使用指令手冊！請從下方的下拉選單中選擇您想了解的指令類別。\n\n**可用類別：**\n🎶 **音樂模組 (Music)** - 播放與控制音樂\n⚔️ **管理工具 (Admin)** - 伺服器與成員管理\n👑 **擁有者工具 (Owner)** - 機器人核心控制\n⚙️ **核心系統 (General)** - 基本功能與狀態'
            },
            music: {
                title: '🎶 音樂模組 (Music)',
                description: '高品質的音樂播放系統：\n\n' +
                             '**基本操作**\n' +
                             '🔹 `/play [歌曲]` - 搜尋並播放網路上的高音質歌曲\n' +
                             '🔹 `/join` - 召喚機器人加入您目前的語音頻道\n' +
                             '🔹 `/disconnect` - 讓機器人離開語音頻道\n\n' +
                             '**播放控制**\n' +
                             '🔹 `/pause` - 暫停目前的播放\n' +
                             '🔹 `/resume` - 繼續播放暫停中的歌曲\n' +
                             '🔹 `/skip` - 跳過目前這首歌曲\n' +
                             '🔹 `/stop` - 停止播放並清空所有等待中的歌曲\n' +
                             '🔹 `/volume [音量]` - 調整音樂播放音量\n\n' +
                             '**狀態查詢**\n' +
                             '🔹 `/nowplaying` - 查看目前正在播放的歌曲資訊\n' +
                             '🔹 `/queue` - 顯示接下來的播放清單'
            },
            admin: {
                title: '⚔️ 管理工具 (Admin)',
                description: '需具備管理員權限的伺服器指令：\n\n' +
                             '🔹 `/ban` - 封鎖指定的伺服器成員\n' +
                             '🔹 `/kick` - 將成員踢出伺服器\n' +
                             '🔹 `/rename` - 變更指定使用者的暱稱'
            },
            owner: {
                title: '👑 擁有者工具 (Owner)',
                description: '需具備擁有者權限的進階指令：\n\n' +
                             '🔹 `/setgame` - 設定機器人正在遊玩的遊戲狀態\n' +
                             '🔹 `/setstatus` - 切換機器人的上線狀態 (如：線上、閒置)\n' +
                             '🔹 `/shutdown` - 安全關閉機器人進程\n' +
                             '🔹 `/restart` - 重新啟動機器人'
            },
            general: {
                title: '⚙️ 核心系統 (General)',
                description: '一般使用者皆可使用的基本指令：\n\n' +
                             '🔹 `/ping` - 查看機器人目前的網路延遲與回應速度\n' +
                             '🔹 `/about` - 顯示機器人的系統狀態與運行資訊\n' +
                             '🔹 `/help` - 開啟本指令手冊\n' +
                             '🔹 `/tts [文字]` - 將文字轉換為語音並在頻道中朗讀'
            }
        };

        const generateEmbed = (category) => {
            return new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle(categories[category].title)
                .setDescription(categories[category].description)
                .setFooter({ text: '由 HaeImDuck 製作', iconURL: bot.user.displayAvatarURL() })
                .setTimestamp();
        };

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('點擊這裡選擇指令類別...')
            .addOptions([
                { label: '首頁 (Home)', description: '回到指令手冊首頁', value: 'home', emoji: '🏠' },
                { label: '音樂模組 (Music)', description: '音樂播放與控制相關指令', value: 'music', emoji: '🎶' },
                { label: '管理工具 (Admin)', description: '伺服器與成員管理指令', value: 'admin', emoji: '⚔️' },
                { label: '擁有者工具 (Owner)', description: '機器人擁有者專屬指令', value: 'owner', emoji: '👑' },
                { label: '核心系統 (General)', description: '基礎功能與狀態查詢指令', value: 'general', emoji: '⚙️' },
            ]);

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            embeds: [generateEmbed('home')],
            components: [actionRow],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 120_000 // 選單在 2 分鐘後自動失效
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '您不能使用這個選單哦！請自己輸入 `/help` 來開啟。', ephemeral: true });
            }

            const selectedCategory = i.values[0];
            await i.update({ embeds: [generateEmbed(selectedCategory)] });
        });

        collector.on('end', () => {
            selectMenu.setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(selectMenu);
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
