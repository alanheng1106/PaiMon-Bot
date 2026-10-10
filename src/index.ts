import BotClient from './core/BotClient';

const core = new BotClient();

let isShuttingDown = false;
const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Process] Received ${signal}. Initiating graceful shutdown...`);
    try {
        await core.shutdown(0);
    } catch (err: any) {
        console.error(`[Process] Error during ${signal} shutdown:`, err?.message || err);
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', () => void handleShutdown('SIGINT'));
process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

core.boot().catch((err: Error) => {
    console.error('[Fatal] Bot boot failed:', err.message);
    process.exit(1);
});
