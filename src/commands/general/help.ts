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
    StringSelectMenuBuilder,
    MessageFlags,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { Colors, Emojis } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface CategoryMeta {
    label: string;
    emoji: string;
    description: string;
    accentColor: number;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
    general: {
        label: '核心系統 (General)',
        emoji: '⚙️',
        description: '基礎功能、資訊查詢與系統運作狀態',
        accentColor: Colors.Success
    },
    music: {
        label: '音樂模組 (Music)',
        emoji: '🎶',
        description: '高音質串流播放、音量控制與佇列管理',
        accentColor: Colors.Music
    },
    admin: {
        label: '管理工具 (Admin)',
        emoji: '⚔️',
        description: '伺服器秩序維護、違規成員審查與自動防護',
        accentColor: Colors.Punish
    },
    owner: {
        label: '擁有者工具 (Owner)',
        emoji: '👑',
        description: '機器人擁有者專屬維護與底層進程控制',
        accentColor: Colors.Warning
    }
};

const DEFAULT_SUPPORT_URL = 'https://github.com/FSOS/PaiMon-Bot';

/**
 * Builds the Home Overview Container combining Plan A (Brand Dashboard) & Plan C (Action Guide)
 */
export function buildHelpHomeContainer(bot: BotClient, _disabled = false): ContainerBuilder {
    const botId = bot.user?.id ?? '123456789012345678';
    const botAvatar =
        bot.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) ??
        'https://cdn.discordapp.com/embed/avatars/0.png';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;

    const container = new ContainerBuilder()
        // Accent Color: Info Blurple for the Home Overview
        .setAccentColor(Colors.Info)
        // Level 1 Heading
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📖 派蒙指令指南'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Hero Section: Text + Avatar Thumbnail (Plan A signature brand hero)
    const heroSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 歡迎使用派蒙指令手冊！\n探索高音質音樂播放、社群審查管理與多元娛樂小工具。\n-# 💡 請從下方選單選取想深入了解的模組，或利用快捷按鈕導覽。'
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar));

    container.addSectionComponents(heroSection);

    // Module Overview List with structured Markdown and Subtext (plain text without > quotes)
    const categoryList = Object.values(CATEGORY_META)
        .map((m) => `${m.emoji} **${m.label}**\n-# ${m.description}`)
        .join('\n\n');

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🗂️ 支援模組總覽\n${categoryList}`));

    // Action Row inside Card: Plan C action-oriented navigation
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('邀請派蒙').setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(inviteUrl),
        new ButtonBuilder()
            .setLabel('官方支援 / 文檔')
            .setEmoji('💬')
            .setStyle(ButtonStyle.Link)
            .setURL(DEFAULT_SUPPORT_URL)
    );

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
        .addActionRowComponents(actionRow);

    return container;
}

/**
 * Builds the Category Detail Container with dynamic accent color, formatted command list, and action buttons
 */
export function buildHelpCategoryContainer(bot: BotClient, category: string, disabled = false): ContainerBuilder {
    const meta = CATEGORY_META[category];
    if (!meta) {
        return buildHelpHomeContainer(bot, disabled);
    }

    const botId = bot.user?.id ?? '123456789012345678';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;

    const allCommands = bot.commands ? [...bot.commands.values()] : [];
    const commands = allCommands.filter((cmd) => cmd.category === category);

    const container = new ContainerBuilder()
        // Dynamic Accent Color per category
        .setAccentColor(meta.accentColor)
        // Level 2 Heading + Module Subtext
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${meta.emoji} ${meta.label}\n-# ${meta.description}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (commands.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('*該模組目前沒有載入任何可用指令。*'));
    } else {
        const formattedCommands = commands
            .map((cmd) => `• \`/${cmd.data.name}\` — **${cmd.data.description || '無詳細說明'}**`)
            .join('\n');

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### 📋 指令列表 (${commands.length})\n${formattedCommands}`)
        );
    }

    // Action Row inside Card: Return Home button (Secondary) + Link buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('返回首頁')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder().setLabel('邀請派蒙').setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(inviteUrl),
        new ButtonBuilder().setLabel('官方支援').setEmoji('💬').setStyle(ButtonStyle.Link).setURL(DEFAULT_SUPPORT_URL)
    );

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
        .addActionRowComponents(actionRow);

    return container;
}

/**
 * Builds the Category Switcher Dropdown ActionRow
 */
export function buildHelpSelectMenu(selected = 'home', disabled = false): ActionRowBuilder<StringSelectMenuBuilder> {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('點擊選擇想瀏覽的指令模組...')
        .setDisabled(disabled)
        .addOptions([
            {
                label: '手冊首頁 (Overview)',
                description: '返回手冊主頁與模組概覽',
                value: 'home',
                emoji: '🏠',
                default: selected === 'home'
            },
            ...Object.entries(CATEGORY_META).map(([key, meta]) => ({
                label: meta.label,
                description: meta.description,
                value: key,
                emoji: meta.emoji,
                default: selected === key
            }))
        ]);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

const command: Command = {
    data: new SlashCommandBuilder().setName('help').setDescription('顯示所有可用指令與詳細說明'),
    category: 'general',
    helpText: '🔹 `/help` - 開啟互動式指令手冊，支援模組分類即時切換與快捷導航',

    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        try {
            let currentCategory = 'home';
            const homeContainer = buildHelpHomeContainer(bot, false);
            const menuRow = buildHelpSelectMenu(currentCategory, false);

            await interaction.reply({
                components: [homeContainer, menuRow],
                flags: MessageFlags.IsComponentsV2
            });

            const response = await interaction.fetchReply();

            const collector = response.createMessageComponentCollector({
                time: 120_000
            });

            collector.on('collect', async (i: ButtonInteraction | StringSelectMenuInteraction) => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({
                            content: `${Emojis.Warning} 這個選單不是你的哦！請自己輸入 \`/help\` 來開啟。`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    if (i.isStringSelectMenu() && i.customId === 'help_menu') {
                        currentCategory = i.values[0];
                    } else if (i.isButton() && i.customId === 'help_home') {
                        currentCategory = 'home';
                    } else {
                        return;
                    }

                    const updatedContainer =
                        currentCategory === 'home'
                            ? buildHelpHomeContainer(bot, false)
                            : buildHelpCategoryContainer(bot, currentCategory, false);
                    const updatedMenuRow = buildHelpSelectMenu(currentCategory, false);

                    await i.update({
                        components: [updatedContainer, updatedMenuRow],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (error: unknown) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    console.warn('[Help] Menu interaction failed:', errMsg);
                }
            });

            collector.on('end', () => {
                const disabledContainer =
                    currentCategory === 'home'
                        ? buildHelpHomeContainer(bot, true)
                        : buildHelpCategoryContainer(bot, currentCategory, true);
                const disabledMenuRow = buildHelpSelectMenu(currentCategory, true);

                interaction
                    .editReply({
                        components: [disabledContainer, disabledMenuRow],
                        flags: MessageFlags.IsComponentsV2
                    })
                    .catch((e: unknown) => {
                        const errMsg = e instanceof Error ? e.message : String(e);
                        console.warn('[Help] Ignored timeout edit error:', errMsg);
                    });
            });
        } catch (err: unknown) {
            console.error('[Help CMD]', err);
            await bot.sendError(interaction, '指令手冊開啟失敗', '無法載入指令手冊，請稍後再試。');
        }
    }
};

export default command;
