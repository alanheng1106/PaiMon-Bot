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

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { LinkFixer: LinkFixConfig } = require('../config');

class ComponentV2CardBuilder {
    /**
     * Build a uniform Message Components V2 ContainerBuilder for a link item and metadata.
     * 
     * @param {Object} item - LinkFixer item (originalUrl, fixedUrl, domainName, color, etc.)
     * @param {Object} ogMetadata - OpenGraph metadata (title, description, image, video, siteName, color)
     * @returns {ContainerBuilder} The constructed V2 container component
     */
    static buildCard(item, ogMetadata = {}) {
        const defaultColorHex = LinkFixConfig?.DefaultCardColor ? `#${LinkFixConfig.DefaultCardColor.toString(16).padStart(6, '0')}` : '#00AEEC';
        const colorHex = ogMetadata.color || item.color || defaultColorHex;
        const colorInt = this.resolveColorInt(colorHex);

        const urlMatch = item.originalUrl.match(/\/(?:post|status|video|p|reels?|reel)\/([\w-]+)/i) || item.originalUrl.match(/\/([\w-]{4,})\/?$/i);
        const postId = urlMatch ? urlMatch[1] : 'Content';
        const postAuthor = ogMetadata.siteName || item.domainName;

        const titleText = `# ${item.domainName} - ${postId}`;
        const descText = ogMetadata.description || `${item.domainName} Post`;

        const container = new ContainerBuilder()
            .setAccentColor(colorInt);

        // 1. Header Title (# Domain - PostID)
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(titleText)
        );

        // 2. Post Content / Stats Description
        const maxLength = LinkFixConfig?.MaxDescriptionLength || 2000;
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(descText.slice(0, maxLength))
        );

        // 3. Separator 1
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 4. Author Section (👤 Author)
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`👤 ${postAuthor}`)
        );

        // 5. Separator 2
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 6. Media Gallery Component V2 (pointing to og.video / og.image for direct media)
        const mediaTargetUrl = ogMetadata.video || ogMetadata.image;
        if (mediaTargetUrl) {
            try {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(mediaTargetUrl)
                    )
                );
            } catch (e) {
                console.warn('[ComponentV2CardBuilder] MediaGallery error:', e.message);
            }
        }

        // 7. Open Original Action Button
        const openButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Open original ↗')
            .setURL(item.originalUrl);

        const row = new ActionRowBuilder().addComponents(openButton);
        container.addActionRowComponents(row);

        return container;
    }

    /**
     * Convert hex color string to integer compatible with Discord API ContainerBuilder.
     * 
     * @param {string} hexStr - Color hex string (e.g. "#1DA1F2")
     * @returns {number} Integer color value
     */
    static resolveColorInt(hexStr) {
        const defaultColor = LinkFixConfig?.DefaultCardColor || 0x00AEEC;
        if (!hexStr) return defaultColor;
        const cleanHex = hexStr.replace('#', '');
        const num = parseInt(cleanHex, 16);
        return isNaN(num) ? defaultColor : num;
    }
}

module.exports = ComponentV2CardBuilder;
