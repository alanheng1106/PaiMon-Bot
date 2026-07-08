require('dotenv').config();
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

// --- Monkey Patch ContainerBuilder to auto-inject SeparatorBuilder ---
const originalAddText = ContainerBuilder.prototype.addTextDisplayComponents;
ContainerBuilder.prototype.addTextDisplayComponents = function(...components) {
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
// ---------------------------------------------------------------------

const BotClient = require('./src/core/BotClient');

const core = new BotClient();
core.boot().catch((err) => {
    console.error('[Fatal] Bot boot failed:', err.message);
    process.exit(1);
});
