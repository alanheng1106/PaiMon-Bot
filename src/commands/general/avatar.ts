import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ChatInputCommandInteraction,
    type User
} from 'discord.js';
import { Colors } from '../../config';
import { getAverageColor } from 'fast-average-color-node';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

/**
 * Normalizes an extracted hex color string to ensure safe contrast
 * against Discord dark-mode theme (#2b2d31).
 * Falls back to Colors.Info when the color is invalid, too dark, or muddy.
 */
export function normalizeAccentColor(hex: string | undefined | null): number {
    if (!hex) return Colors.Info;
    const cleanHex = hex.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) return Colors.Info;

    const color = parseInt(cleanHex, 16);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    // Perceived luminance using ITU-R BT.601
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;

    // If too dark or muddy grey near background darkness, fall back to Info Blurple
    if (luminance < 38) {
        return Colors.Info;
    }

    return color;
}

/**
 * Extracts average color from the user's avatar image URL with safe error fallback.
 */
export async function fetchAvatarColor(avatarUrl: string): Promise<number> {
    try {
        const colorData = await getAverageColor(avatarUrl);
        return normalizeAccentColor(colorData?.hex);
    } catch {
        return Colors.Info;
    }
}

export interface BuildAvatarContainerOptions {
    targetUser: User;
    accentColor: number;
}

/**
 * Builds Scheme A (Art-Centric Showcase) Components V2 Container for /avatar.
 * Features:
 * - Clear Markdown heading hierarchy (# for Title, -# for secondary metadata)
 * - Safe dynamic accent color framing
 * - Small Divider between title & gallery, Large Divider isolating action buttons
 * - High-res MediaGallery with multi-format download buttons (PNG/JPG/WEBP/GIF)
 */
export function buildAvatarContainer(options: BuildAvatarContainerOptions): ContainerBuilder {
    const { targetUser, accentColor } = options;

    const isAnimated = targetUser.avatar?.startsWith('a_') ?? false;
    const displayName = targetUser.globalName || targetUser.username;
    const createdUnix = targetUser.createdTimestamp ? Math.floor(targetUser.createdTimestamp / 1000) : 0;

    // High resolution URLs for various formats
    const dynamicUrl = targetUser.displayAvatarURL({ size: 1024, forceStatic: false });
    const pngUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
    const jpgUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'jpg' });
    const webpUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'webp' });

    // 1. TextDisplay: Level 1 Title with Subtext (-#) for structured metadata
    const formatBadge = isAnimated ? ' • ✨ 動態頭像 (GIF)' : ' • 🖼️ 靜態圖片';
    const headerContent = [
        `# 🖼️ ${displayName} 的大頭貼`,
        `-# @${targetUser.username} • 🆔 \`${targetUser.id}\` • 註冊於 <t:${createdUnix}:d> (<t:${createdUnix}:R>)${formatBadge}`
    ].join('\n');

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
        // Small divider between header metadata and artwork
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 2. High resolution MediaGallery
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(dynamicUrl)))
        // 3. Large divider isolating artwork showcase from interactive action buttons
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

    // 4. Multi-format download buttons row
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('PNG').setStyle(ButtonStyle.Link).setURL(pngUrl),
        new ButtonBuilder().setLabel('JPG').setStyle(ButtonStyle.Link).setURL(jpgUrl),
        new ButtonBuilder().setLabel('WEBP').setStyle(ButtonStyle.Link).setURL(webpUrl)
    );

    if (isAnimated) {
        actionRow.addComponents(new ButtonBuilder().setLabel('GIF 動圖').setStyle(ButtonStyle.Link).setURL(dynamicUrl));
    }

    actionRow.addComponents(new ButtonBuilder().setLabel('原圖連結').setStyle(ButtonStyle.Link).setURL(dynamicUrl));

    container.addActionRowComponents(actionRow);

    return container;
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('取得使用者的高清大頭貼與下載連結')
        .addUserOption((option) =>
            option.setName('user').setDescription('選擇一位使用者 (若未選擇則顯示自己的)').setRequired(false)
        ),
    category: 'general',
    helpText: '🔹 `/avatar [使用者]` - 檢視並取得使用者的大尺寸大頭貼與多格式下載',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const pngUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
            const accentColor = await fetchAvatarColor(pngUrl);

            const container = buildAvatarContainer({ targetUser, accentColor });

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 as any });
        } catch (err: unknown) {
            console.error('[Avatar CMD]', err);
            await bot.sendError(interaction, '查詢失敗', '無法取得使用者大頭貼，請稍後再試。');
        }
    }
};

export default command;
