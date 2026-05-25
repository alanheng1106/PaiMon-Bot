require('dotenv').config();
const BotClient = require('./src/core/BotClient');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is active!'));

app.listen(port, async () => {
    console.log(`[System] Web environment ready on port ${port}`);

    const core = new BotClient();
    try {
        await core.boot();
    } catch (err) {
        console.error('[Fatal] Bot boot failed:', err.message);
    }
});
