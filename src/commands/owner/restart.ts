import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder().setName('restart').setDescription('重新啟動機器人 (僅限擁有者)'),
    category: 'owner',
    helpText: '🔹 `/restart` - 安全重啟機器人進程（僅限 OWNER_ID 指定的擁有者）',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }

        await bot.sendSuccess(interaction, '🔄 系統重啟', '機器人正在重新啟動中... 稍後見！', true);
        console.log(`[Core] Restart sequence initiated by ${interaction.user.tag}`);

        // Exit code 1 triggers Docker's "restart: unless-stopped" policy
        try {
            await bot.shutdown(1);
        } catch (error: any) {
            console.error('[Core] Error during restart shutdown sequence:', error);
        } finally {
            process.exit(1);
        }
    }
};

export default command;
