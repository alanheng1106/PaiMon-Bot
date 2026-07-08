const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

try {
    const fontPath = path.join(__dirname, '..', '..', 'fonts', 'NotoSansTC-Bold.otf');
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'Noto Sans TC');
    }
} catch (e) {
    console.error('Error loading font:', e);
}
class StoreCanvas {
    /**
     * Build the store canvas image.
     * @param {Array} skins - Array of { uuid, displayName, displayIcon, tierName, tierColor, price }
     * @param {number} remainingSeconds - Remaining time in seconds
     * @returns {Promise<Buffer>} - PNG buffer
     */
    static async generateStoreImage(skins, remainingSeconds) {
        const width = 1600;
        const height = 800;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#101115'; // Very dark Valorant-like background
        ctx.fillRect(0, 0, width, height);

        // Header Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('每日優惠', 80, 100);

        // Header Timer
        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;
        const timerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        ctx.fillStyle = '#8b8e96';
        ctx.font = 'bold 36px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(timerText, width - 80, 100);

        // Grid parameters
        const cardWidth = 330;
        const cardHeight = 450;
        const gap = 30;
        const startX = (width - (4 * cardWidth + 3 * gap)) / 2; // Center the 4 cards
        const startY = 160;

        // Load VP Icon
        let vpIcon = null;
        try {
            vpIcon = await loadImage(
                'https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png'
            );
        } catch (e) {
            console.error('Failed to load VP icon:', e);
        }

        // Draw Cards
        for (let i = 0; i < skins.length; i++) {
            const skin = skins[i];
            const cx = startX + i * (cardWidth + gap);
            const cy = startY;

            // Card Background
            ctx.fillStyle = '#1c1c24';
            this.roundRect(ctx, cx, cy, cardWidth, cardHeight, 16);
            ctx.fill();

            // Colored Top Border (Rarity)
            const gradient = ctx.createLinearGradient(cx, cy, cx + cardWidth, cy);
            const baseColor = skin.tierColor || '#888888';
            gradient.addColorStop(0, this.adjustColor(baseColor, -40));
            gradient.addColorStop(0.5, baseColor);
            gradient.addColorStop(1, this.adjustColor(baseColor, -40));

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(cx, cy, cardWidth, 8, [16, 16, 0, 0]);
            ctx.fill();

            // Rarity Glow effect behind weapon (subtle)
            ctx.save();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = baseColor;
            ctx.beginPath();
            ctx.arc(cx + cardWidth / 2, cy + cardHeight / 2 - 30, 120, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();

            // Load and draw Weapon Image
            if (skin.displayIcon) {
                try {
                    const wImg = await loadImage(skin.displayIcon);
                    // Fit image into bounding box 280x200
                    const boxW = 280;
                    const boxH = 150;
                    let drawW = wImg.width;
                    let drawH = wImg.height;

                    const scale = Math.min(boxW / drawW, boxH / drawH);
                    drawW *= scale;
                    drawH *= scale;

                    const drawX = cx + (cardWidth - drawW) / 2;
                    // The background circle center is at cy + cardHeight / 2 - 30 = cy + 195.
                    // We want the image center (drawY + drawH / 2) to equal cy + 195.
                    const drawY = cy + 195 - drawH / 2;

                    ctx.drawImage(wImg, drawX, drawY, drawW, drawH);
                } catch (e) {
                    console.error('Failed to load skin image:', e);
                }
            }

            // Bottom Text Area
            const textYOffset = cy + cardHeight - 120;

            // Rarity Text
            ctx.fillStyle = baseColor;
            ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText((skin.tierName || 'UNKNOWN').toUpperCase(), cx + 25, textYOffset);

            // Skin Name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px "Noto Sans TC", sans-serif';
            let name = skin.displayName || '未知造型';
            // Truncate if too long
            if (name.length > 20) name = name.substring(0, 18) + '...';
            ctx.fillText(name, cx + 25, textYOffset + 35);

            // Price and VP icon
            const priceY = textYOffset + 75;
            if (vpIcon) {
                ctx.drawImage(vpIcon, cx + 25, priceY - 22, 28, 28);
            }
            ctx.fillStyle = '#e5e5e5';
            ctx.font = 'bold 24px "Noto Sans TC", sans-serif';
            const priceStr = skin.price ? skin.price.toLocaleString() : '未知';
            ctx.fillText(priceStr, cx + 60, priceY);
        }

        // Footer removed as requested

        return await canvas.encode('png');
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
     * Helper to darken/lighten a hex color
     */
    static adjustColor(color, amount) {
        let usePound = false;
        if (color[0] == '#') {
            color = color.slice(1);
            usePound = true;
        }
        let num = parseInt(color, 16);
        if (isNaN(num)) return usePound ? '#888888' : '888888';
        let r = (num >> 16) + amount;
        if (r > 255) r = 255;
        else if (r < 0) r = 0;
        let g = ((num >> 8) & 0x00ff) + amount;
        if (g > 255) g = 255;
        else if (g < 0) g = 0;
        let b = (num & 0x0000ff) + amount;
        if (b > 255) b = 255;
        else if (b < 0) b = 0;
        return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
    }
}

module.exports = StoreCanvas;
