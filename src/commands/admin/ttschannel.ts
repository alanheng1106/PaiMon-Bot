import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ChatInputCommandInteraction,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    User
} from 'discord.js';
import { Colors } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface TTSSettings {
    channelId: string;
    lang: string;
}

export const TTS_LANG_LABELS: Record<string, string> = {
    'zh-TW': '🇹🇼 繁體中文',
    en: '🇺🇸 英文',
    ja: '🇯🇵 日文',
    ko: '🇰🇷 韓文',
    'zh-CN': '🇨🇳 簡體中文',
    fr: '🇫🇷 法文',
    es: '🇪🇸 西班牙文'
};

export interface BuildTTSConsoleCardOptions {
    channel: { id?: string; name?: string };
    lang: string;
    executor?: User | { id?: string; username?: string; tag?: string } | null;
    guild?: { iconURL?: (options?: any) => string | null; name?: string } | null;
}

/**
 * Builds the interactive CV2 console card for automated TTS channel binding (Sleek Full-Width Design).
 * Features:
 * - Left Accent: Success Green (0x57f287) indicating active confirmation
 * - Header: Clean, concise H3 title (### 🎙️ 自動 TTS 頻道已設定)
 * - Divider: Small spacing divider line
 * - Core Data: Full-width clean text layout with target channel, readable language badge, and active status
 *   (Zero clumsy placeholder thumbnails for maximum breathing room and mobile responsiveness)
 * - Divider: Divider line before interactive buttons
 * - ActionRow:
 *   - Quick Test button (Primary, 🔊 測試發音)
 *   - Quick Unbind button (Secondary, 🔌 解除綁定)
 * - Footer: Minimalist single-line subtext without tacky emoji clutter
 */
export function buildTTSConsoleCard({ channel, lang, executor }: BuildTTSConsoleCardOptions) {
    const timestamp = Math.floor(Date.now() / 1000);
    const langLabel = TTS_LANG_LABELS[lang] || lang;
    const channelDisplay = channel?.id ? `<#${channel.id}>` : channel?.name ? `**#${channel.name}**` : '未指定頻道';
    const executorMention = executor?.id ? `<@${executor.id}>` : (executor?.username ?? '管理員');

    const container = new ContainerBuilder()
        .setAccentColor(Colors.Success)
        // 1. 真正的 Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎙️ 自動 TTS 頻道已設定'))
        // 2. 標題與正文的實線分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 全寬核心配置數據（去除冗餘的縮略圖，避免預設頭像占位黑洞）
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**目標頻道**：${channelDisplay}\n` +
                    `**發音語言**：${langLabel} (\`${lang}\`)\n` +
                    `**運作狀態**：\`🟢 待命中\``
            )
        );

    // 4. 異構邊界分割線 + 操作按鈕行
    if (channel?.id) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`tts:test:${channel.id}`)
                .setLabel('測試發音')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`tts:unbind:${channel.id}`)
                .setLabel('解除綁定')
                .setEmoji('🔌')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(actionRow);
    }

    // 5. 底部極簡降權審計腳注（拿掉多餘的警察、燈泡 Emoji，保持現代高階調性）
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# 在此頻道發送文字將自動朗讀 • 設定者：${executorMention} • <t:${timestamp}:R>`
        )
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

export interface BuildTTSReleaseCardOptions {
    channelId?: string;
    executor?: User | { id?: string; username?: string; tag?: string } | null;
    guild?: { iconURL?: (options?: any) => string | null; name?: string } | null;
}

/**
 * Builds the CV2 release card when TTS channel binding is removed.
 * Features:
 * - Accent Color: Visible Cool Slate Grey (0x95a5a6), preventing invisible borders in Discord Dark theme
 * - Header: Contextual action title (### 🔌 自動 TTS 頻道已解除)
 * - Full-Width Data: Target channel and disabled status without bloated thumbnails
 * - Footer: Minimalist subtext without emoji noise
 */
export function buildTTSReleaseCard({ channelId, executor }: BuildTTSReleaseCardOptions) {
    const timestamp = Math.floor(Date.now() / 1000);
    const channelDisplay = channelId ? `<#${channelId}>` : '自動 TTS 頻道';
    const executorMention = executor?.id ? `<@${executor.id}>` : (executor?.username ?? '管理員');

    const container = new ContainerBuilder()
        .setAccentColor(0x95a5a6) // 高級中性冷灰，在深色背景下邊框輪廓清晰分明
        // 1. 真正的 Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔌 自動 TTS 頻道已解除'))
        // 2. 實線分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 全寬狀態展示
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**解除頻道**：${channelDisplay}\n` + `**當前狀態**：\`⚪ 已停用\``)
        )
        // 4. 底部極簡降權審計腳注
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# 伺服器已解除自動朗讀功能 • 執行者：${executorMention} • <t:${timestamp}:R>`
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('ttschannel')
        .setDescription('設定自動語音 (TTS) 的專屬文字頻道')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set')
                .setDescription('綁定一個文字頻道作為自動 TTS 頻道')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('要綁定的文字頻道')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName('lang')
                        .setDescription('預設播放語言 (預設: zh-TW)')
                        .setRequired(false)
                        .addChoices(
                            { name: '🇹🇼 繁體中文 (zh-TW)', value: 'zh-TW' },
                            { name: '🇺🇸 英文 (en)', value: 'en' },
                            { name: '🇯🇵 日文 (ja)', value: 'ja' },
                            { name: '🇰🇷 韓文 (ko)', value: 'ko' }
                        )
                )
        )
        .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('解除綁定自動 TTS 頻道'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 3,
    helpText: '🔹 `/ttschannel set [頻道]` - 綁定自動 TTS 頻道\n🔹 `/ttschannel remove` - 解除綁定自動 TTS 頻道',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'set') {
                const channel = interaction.options.getChannel('channel', true);
                const currentSettings = bot.settings.get<TTSSettings>(interaction.guild.id, 'tts');
                const selectedLang = interaction.options.getString('lang');
                const lang = selectedLang || currentSettings?.lang || 'zh-TW';

                bot.settings.set(interaction.guild.id, 'tts', {
                    channelId: channel.id,
                    lang
                });

                const payload = buildTTSConsoleCard({
                    channel: { id: channel.id, name: (channel as any).name },
                    lang,
                    executor: interaction.user,
                    guild: interaction.guild
                });

                if (interaction.deferred && typeof interaction.editReply === 'function') {
                    await interaction.editReply(payload as any);
                } else if (typeof interaction.reply === 'function') {
                    await interaction.reply(payload as any);
                } else {
                    await bot.sendSuccess(
                        interaction,
                        '自動 TTS 頻道已設定',
                        `已將 <#${channel.id}> 設為自動語音頻道。\n**語言**：\`${lang}\``
                    );
                }
            } else if (subcommand === 'remove') {
                const currentSettings = bot.settings.get<TTSSettings>(interaction.guild.id, 'tts');
                if (!currentSettings?.channelId) {
                    return await bot.sendError(interaction, '操作無效', '目前尚未綁定任何自動 TTS 頻道.');
                }

                const removedChannelId = currentSettings.channelId;
                bot.settings.set(interaction.guild.id, 'tts', null);

                const payload = buildTTSReleaseCard({
                    channelId: removedChannelId,
                    executor: interaction.user,
                    guild: interaction.guild
                });

                if (interaction.deferred && typeof interaction.editReply === 'function') {
                    await interaction.editReply(payload as any);
                } else if (typeof interaction.reply === 'function') {
                    await interaction.reply(payload as any);
                } else {
                    await bot.sendSuccess(interaction, '自動 TTS 頻道已解除', '伺服器已解除綁定自動語音頻道。');
                }
            } else {
                return await bot.sendError(interaction, '操作無效', '未知的子指令操作.');
            }
        } catch (err) {
            console.error('[TTSChannel CMD]', err);
            return await bot.sendError(interaction, '執行失敗', '處理自動 TTS 頻道設定時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
