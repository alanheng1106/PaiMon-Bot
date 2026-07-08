const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

/**
 * Build a styled ContainerBuilder that automatically injects a visual separator
 * after any line starting with `### `. This replaces the old monkey-patch on
 * ContainerBuilder.prototype.addTextDisplayComponents.
 *
 * @param {number} accentColor - Hex color for the container accent.
 * @param {string} content     - Markdown text content. Lines beginning with
 *                                `### ` trigger a separator after them.
 * @returns {ContainerBuilder}
 */
function buildContainer(accentColor, content) {
    const container = new ContainerBuilder().setAccentColor(accentColor);
    const lines = content.split('\n');
    let currentBlock = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentBlock.push(line);

        if (line.trim().startsWith('### ')) {
            const joined = currentBlock.join('\n').trim();
            if (joined) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(joined));
            }
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            currentBlock = [];
        }
    }

    const joined = currentBlock.join('\n').trim();
    if (joined) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(joined));
    }

    return container;
}

module.exports = { buildContainer };
