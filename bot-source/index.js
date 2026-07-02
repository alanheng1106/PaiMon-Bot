require('dotenv').config();
const BotClient = require('./src/core/BotClient');

const core = new BotClient();
core.boot().catch(err => {
    console.error('[Fatal] Bot boot failed:', err.message);
    process.exit(1);
});
