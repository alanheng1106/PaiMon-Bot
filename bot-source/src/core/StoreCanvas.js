const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { LRUCache } = require('lru-cache');
const fs = require('fs');
const path = require('path');

const { StoreCanvas: StoreConfig } = require('../config');
const ColorUtils = require('../utils/ColorUtils');

try {
    const fontPath = path.join(__dirname, '..', '..', 'fonts', 'NotoSansTC-Bold.otf');
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'Noto Sans TC');
    }
} catch (e) {
    console.error('Error loading font:', e);
}

class StoreCanvas {
    static #imageCache = new LRUCache({
        max: 100,
        ttl: 1000 * 60 * 60 * 6 // 6 hours TTL
    });

    static LAYOUT = {
        WIDTH: StoreConfig?.Width || 1600,
        HEIGHT: StoreConfig?.Height || 800,
        CARD_WIDTH: StoreConfig?.CardWidth || 330,
        CARD_HEIGHT: StoreConfig?.CardHeight || 450,
        GAP: StoreConfig?.Gap || 30,
        START_Y: StoreConfig?.StartY || 160,
        CORNER_RADIUS: StoreConfig?.CornerRadius || 16,
        BG_COLOR: StoreConfig?.BgColor || '#101115',
        CARD_BG_COLOR: StoreConfig?.CardBgColor || '#1c1c24',
        HEADER_FONT: 'bold 48px "Noto Sans TC", sans-serif',
        TIMER_FONT: 'bold 36px "Noto Sans TC", sans-serif',
        RARITY_FONT: 'bold 18px "Noto Sans TC", sans-serif',
        NAME_FONT: 'bold 24px "Noto Sans TC", sans-serif',
        PRICE_FONT: 'bold 24px "Noto Sans TC", sans-serif'
    };

    /**
     * Load image with in-memory caching to optimize HTTP requests.
     * @param {string} url 
     * @returns {Promise<Image|null>}
     */
    static async #loadImageCached(url) {
        if (!url) return null;
        if (this.#imageCache.has(url)) {
            return this.#imageCache.get(url);
        }
        try {
            const img = await loadImage(url);
            this.#imageCache.set(url, img);
            return img;
        } catch (e) {
            console.error(`[StoreCanvas] Failed to load image from ${url}:`, e.message);
            return null;
        }
    }

    /**
     * Build the store canvas image.
     * @param {Array} skins - Array of { uuid, displayName, displayIcon, tierName, tierColor, price }
     * @param {number} remainingSeconds - Remaining time in seconds
     * @returns {Promise<Buffer>} - PNG buffer
     */
    static async generateStoreImage(skins, remainingSeconds) {
        const layout = StoreCanvas.LAYOUT;
        const width = layout.WIDTH;
        const height = layout.HEIGHT;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = layout.BG_COLOR;
        ctx.fillRect(0, 0, width, height);

        // Header Title & Countdown Timer
        this.#drawHeader(ctx, layout, width, remainingSeconds);

        // Grid parameters
        const cardWidth = layout.CARD_WIDTH;
        const cardHeight = layout.CARD_HEIGHT;
        const gap = layout.GAP;
        const startX = (width - (4 * cardWidth + 3 * gap)) / 2; // Center cards horizontally
        const startY = layout.START_Y;

        // Load VP Icon with caching
        const vpIconUrl = StoreConfig?.VpIconUrl || 'https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png';
        const vpIcon = await this.#loadImageCached(vpIconUrl);

        // Draw Store Cards
        for (let i = 0; i < skins.length; i++) {
            const cx = startX + i * (cardWidth + gap);
            const cy = startY;
            await this.#drawCard(ctx, layout, skins[i], cx, cy, cardWidth, cardHeight, vpIcon);
        }

        return await canvas.encode('png');
    }

    static #drawHeader(ctx, layout, width, remainingSeconds) {
        ctx.fillStyle = '#ffffff';
        ctx.font = layout.HEADER_FONT;
        ctx.textAlign = 'left';
        ctx.fillText(StoreConfig?.HeaderTitle || '每日優惠', 80, 100);

        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;
        const timerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        ctx.fillStyle = '#8b8e96';
        ctx.font = layout.TIMER_FONT;
        ctx.textAlign = 'right';
        ctx.fillText(timerText, width - 80, 100);
    }

    static async #drawCard(ctx, layout, skin, cx, cy, cardWidth, cardHeight, vpIcon) {
        // Card Background
        ctx.fillStyle = layout.CARD_BG_COLOR;
        this.roundRect(ctx, cx, cy, cardWidth, cardHeight, layout.CORNER_RADIUS);
        ctx.fill();

        // Colored Top Border (Rarity)
        const gradient = ctx.createLinearGradient(cx, cy, cx + cardWidth, cy);
        const baseColor = skin.tierColor || '#888888';
        gradient.addColorStop(0, this.adjustColor(baseColor, -40));
        gradient.addColorStop(0.5, baseColor);
        gradient.addColorStop(1, this.adjustColor(baseColor, -40));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardWidth, 8, [layout.CORNER_RADIUS, layout.CORNER_RADIUS, 0, 0]);
        ctx.fill();

        // Rarity Glow effect behind weapon
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(cx + cardWidth / 2, cy + cardHeight / 2 - 30, 120, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();

        // Load and draw Weapon Image (Cached)
        if (skin.displayIcon) {
            const wImg = await this.#loadImageCached(skin.displayIcon);
            if (wImg) {
                const boxW = 280;
                const boxH = 150;
                let drawW = wImg.width;
                let drawH = wImg.height;

                const scale = Math.min(boxW / drawW, boxH / drawH);
                drawW *= scale;
                drawH *= scale;

                const drawX = cx + (cardWidth - drawW) / 2;
                const drawY = cy + 195 - drawH / 2;

                ctx.drawImage(wImg, drawX, drawY, drawW, drawH);
            }
        }

        // Bottom Text Area
        const textYOffset = cy + cardHeight - 120;

        // Rarity Text
        ctx.fillStyle = baseColor;
        ctx.font = layout.RARITY_FONT;
        ctx.textAlign = 'left';
        ctx.fillText((skin.tierName || 'UNKNOWN').toUpperCase(), cx + 25, textYOffset);

        // Skin Name
        ctx.fillStyle = '#ffffff';
        ctx.font = layout.NAME_FONT;
        let name = skin.displayName || (StoreConfig?.DefaultSkinName || '未知造型');
        if (name.length > 20) name = name.substring(0, 18) + '...';
        ctx.fillText(name, cx + 25, textYOffset + 35);

        // Price and VP icon
        const priceY = textYOffset + 75;
        if (vpIcon) {
            ctx.drawImage(vpIcon, cx + 25, priceY - 22, 28, 28);
        }
        ctx.fillStyle = '#e5e5e5';
        ctx.font = layout.PRICE_FONT;
        const priceStr = skin.price ? skin.price.toLocaleString() : '未知';
        ctx.textAlign = 'left';
        ctx.fillText(priceStr, vpIcon ? cx + 60 : cx + 25, priceY);
    }

    /**
     * Helper to draw rounded rectangle
     */
    static roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Helper to darken/lighten a hex color (delegated to ColorUtils).
     */
    static adjustColor(color, amount) {
        return ColorUtils.adjustColor(color, amount);
    }
}

module.exports = StoreCanvas;
