require('dotenv').config();

// Install the global UI patch BEFORE loading any commands.
// This auto-injects separator dividers after ### headings in ContainerBuilder.
const { installUIPatch } = require('./src/core/uiHelper');
installUIPatch();

const BotClient = require('./src/core/BotClient');

const core = new BotClient();
core.boot().catch((err) => {
    console.error('[Fatal] Bot boot failed:', err.message);
    process.exit(1);
});
