/**
 * Global UI Patch — Auto-inject SeparatorBuilder after `### ` headings.
 *
 * This patches ContainerBuilder.prototype.addTextDisplayComponents so that
 * every TextDisplayBuilder whose content contains a `### ` heading is
 * automatically split into separate text blocks with dividers between them.
 *
 * WHY A PATCH?  The bot uses `### ` headings as a visual section delimiter
 * across 30+ command files.  Rather than importing a helper in every file,
 * this single patch keeps the codebase DRY.  If discord.js ever changes the
 * ContainerBuilder API, this is the ONE place to update.
 *
 * Call this function ONCE at startup (before any commands run).
 */

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

function installUIPatch() {
    const originalAddText = ContainerBuilder.prototype.addTextDisplayComponents;

    ContainerBuilder.prototype.addTextDisplayComponents = function (...components) {
        for (const comp of components) {
            if (comp && comp.data && typeof comp.data.content === 'string') {
                const lines = comp.data.content.split('\n');
                let currentBlock = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    currentBlock.push(line);
                    if (line.trim().startsWith('### ')) {
                        const joined = currentBlock.join('\n').trim();
                        if (joined) {
                            originalAddText.call(this, new TextDisplayBuilder().setContent(joined));
                        }
                        this.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                        currentBlock = [];
                    }
                }
                const joined = currentBlock.join('\n').trim();
                if (joined) {
                    originalAddText.call(this, new TextDisplayBuilder().setContent(joined));
                }
            } else {
                originalAddText.call(this, comp);
            }
        }
        return this;
    };

    console.log('[UI] Separator auto-injection patch installed.');
}

module.exports = { installUIPatch };
