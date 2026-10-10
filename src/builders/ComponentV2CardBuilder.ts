/**
 * ComponentV2CardBuilder — Builder for Discord Message Components V2 containers.
 *
 * Enforces a uniform, elegant 7-section layout for social media embed cards across all 19 platforms:
 * 1. Header Title: # Domain - PostID
 * 2. Description: Text & stats
 * 3. Separator 1: Small spacing divider
 * 4. Author: 👤 AuthorName
 * 5. Separator 2: Small spacing divider
 * 6. Media Gallery: Playable Video / Image
 * 7. Action Row: Open original ↗ Link Button
 * 8. Accent Color: Brand color integer
 */

import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { LinkFixer as LinkFixConfig } from '../config';
import { LinkFixItem } from '../core/LinkFixer';
import { ScrapedMetadata } from '../core/scrapers/BaseMetadataScraper';

class ComponentV2CardBuilder {
    /**
     * Build a uniform Message Components V2 ContainerBuilder for a link item and metadata.
     */
    static buildCard(item: LinkFixItem, ogMetadata: Partial<ScrapedMetadata> = {}): ContainerBuilder {
        const defaultColorHex = LinkFixConfig?.DefaultCardColor
            ? `#${LinkFixConfig.DefaultCardColor.toString(16).padStart(6, '0')}`
            : '#00AEEC';
        const colorHex = (ogMetadata as any).color || item.color || defaultColorHex;
        const colorInt = this.resolveColorInt(colorHex);

        const urlMatch =
            item.originalUrl.match(/\/(?:post|status|video|p|reels?|reel)\/([\w-]+)/i) ||
            item.originalUrl.match(/\/([\w-]{4,})\/?$/i);
        const postId = urlMatch ? urlMatch[1] : 'Content';
        const postAuthor = (ogMetadata as any).siteName || item.domainName;

        const titleText = `# ${item.domainName} - ${postId}`;
        const descText = ogMetadata.description || `${item.domainName} Post`;

        const container = new ContainerBuilder().setAccentColor(colorInt);

        // 1. Header Title (# Domain - PostID)
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));

        // 2. Post Content / Stats Description
        const maxLength = LinkFixConfig?.MaxDescriptionLength || 2000;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(descText.slice(0, maxLength)));

        // 3. Separator 1
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 4. Author Section (👤 Author)
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`👤 ${postAuthor}`));

        // 5. Separator 2
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. Media Gallery Component V2 (pointing to og.video / og.image for direct media)
        const mediaTargetUrl = ogMetadata.video || ogMetadata.image;
        if (mediaTargetUrl) {
            try {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(mediaTargetUrl))
                );
            } catch (e: any) {
                console.warn('[ComponentV2CardBuilder] MediaGallery error:', e.message);
            }
        }

        // 7. Open Original Action Button
        const openButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Open original ↗')
            .setURL(item.originalUrl);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(openButton);
        container.addActionRowComponents(row);

        return container;
    }

    /**
     * Convert hex color string to integer compatible with Discord API ContainerBuilder.
     */
    static resolveColorInt(hexStr?: string | number): number {
        const defaultColor = LinkFixConfig?.DefaultCardColor || 0x00aeec;
        if (!hexStr) return defaultColor;
        if (typeof hexStr === 'number') return hexStr;
        const cleanHex = hexStr.replace('#', '');
        const num = parseInt(cleanHex, 16);
        return isNaN(num) ? defaultColor : num;
    }
}

export default ComponentV2CardBuilder;
