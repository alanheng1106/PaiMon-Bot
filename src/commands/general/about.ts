import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    ChatInputCommandInteraction,
    ButtonInteraction
} from 'discord.js';
import os from 'os';
import { Colors, Emojis } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

/**
 * Builds a refined Discord Message Components V2 Container for the /about system dashboard.
 * Implements true Markdown Heading hierarchy (# for Title, ### for Sections),
 * balanced Section height matching the Thumbnail, and responsive full-width metrics.
 */
export function buildAboutContainer(bot: BotClient, disabled = false): ContainerBuilder {
    // 1. Process Stats
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;

    // 2. Hardware Stats
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalMem = (totalBytes / 1024 ** 3).toFixed(2);
    const usedMem = (usedBytes / 1024 ** 3).toFixed(2);
    const memPercent = totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0.0';

    const cpuCpus = os.cpus();
    const cpuRaw =
        cpuCpus && cpuCpus.length > 0 && cpuCpus[0]?.model
            ? cpuCpus[0].model.replace(/\s+/g, ' ').trim()
            : 'Unknown CPU';
    // Mobile optimization: Strip repetitive vendor boilerplate to prevent awkward line breaks
    const cpuModel = cpuRaw.replace(/\(R\)|\(TM\)|Processor|CPU|@\s*[\d.]+GHz/gi, '').trim() || 'Unknown CPU';

    const osPlatform = os.platform() === 'linux' ? 'Linux' : os.platform() === 'win32' ? 'Windows' : os.platform();
    const osArch = os.arch();
    const nowUnix = Math.floor(Date.now() / 1000);

    const botName = bot.user?.username ?? 'Bot';
    const discriminator =
        bot.user?.discriminator && bot.user.discriminator !== '0' ? ` #${bot.user.discriminator}` : '';
    const botId = bot.user?.id ?? 'Unknown ID';
    const guildCount = bot.guilds?.cache?.size ?? 0;

    // 3. Assemble Components V2 Container
    const container = new ContainerBuilder()
        // Accent Color: Success green conveys "Operational / Healthy"
        .setAccentColor(Colors.Success)

        // Top Main Header: True Level-1 Heading
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 系統運作狀態`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Section 1: Bot Identity & Status (Strictly 2-3 lines to achieve 1:1 height balance with Thumbnail)
    const sectionText = `### ${botName}${discriminator}\n🟢 **全系統運作正常**\n-# 🆔 \`${botId}\``;
    const headerSection = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(sectionText)
    );

    const avatarUrl =
        bot.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png';
    headerSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    container.addSectionComponents(headerSection);

    // Section 2: Service Metrics with true Level-3 Heading (###)
    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### 📊 服務運行數據\n⏱️ 運行時長：\`${uptimeStr}\`  •  📡 伺服器涵蓋：\`${guildCount} Guilds\``
            )
        )

        // Section 3: Hardware Load with true Level-3 Heading (###)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### 🖥️ 資源負載狀態\n📟 處理器：\`${cpuModel}\`\n📊 記憶體：\`${usedMem} GB\` / \`${totalMem} GB\` (\`${memPercent}%\`)`
            )
        )

        // Section 4: Architecture & Dynamic Timestamp Subtext (-#)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ⚙️ 執行環境：Node.js ${process.version} (${osPlatform} ${osArch})\n-# 🕒 最後更新：<t:${nowUnix}:T> (<t:${nowUnix}:R>)`
            )
        );

    // Section 5: Action Button Row with Large Separator isolation
    const refreshButton = new ButtonBuilder()
        .setCustomId('refresh_about')
        .setLabel('重新整理狀態')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton));

    return container;
}

const command: Command = {
    data: new SlashCommandBuilder().setName('about').setDescription('查看機器人運行狀態與系統負載'),
    category: 'general',
    helpText: '🔹 `/about` - 查看系統狀態、運行時長與資源用量',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        try {
            const container = buildAboutContainer(bot, false);
            await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            const response = await interaction.fetchReply();

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300_000 // 5 minutes timeout
            });

            collector.on('collect', async (i: ButtonInteraction) => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({
                            content: `${Emojis.Warning} 這個按鈕屬於發起指令的成員，請自行輸入 \`/about\` 查看。`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    if (i.customId === 'refresh_about') {
                        const updatedContainer = buildAboutContainer(bot, false);
                        await i.update({
                            components: [updatedContainer],
                            flags: MessageFlags.IsComponentsV2
                        });
                    }
                } catch (error: unknown) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    console.warn('[About] Button interaction failed:', errMsg);
                }
            });

            collector.on('end', () => {
                const disabledContainer = buildAboutContainer(bot, true);
                interaction
                    .editReply({
                        components: [disabledContainer],
                        flags: MessageFlags.IsComponentsV2
                    })
                    .catch((e: unknown) => {
                        const errMsg = e instanceof Error ? e.message : String(e);
                        console.warn('[About] Ignored timeout edit error:', errMsg);
                    });
            });
        } catch (err: unknown) {
            console.error('[About CMD]', err);
            await bot.sendError(interaction, '查詢失敗', '無法取得系統資訊，請稍後再試。');
        }
    }
};

export default command;
