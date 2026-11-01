import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import OwnerUtils from '../../utils/OwnerUtils';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder().setName('shutdown').setDescription('關機機器人 (僅限擁有者)'),
    category: 'owner',
    helpText: '🔹 `/shutdown` - 安全關機機器人進程（僅限 OWNER_ID 指定的擁有者）',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!OwnerUtils.isOwner(interaction.user.id)) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }

        await bot.sendSuccess(interaction, '⏹️ 系統關機', '🛑 機器人正在關機中... 再見', true);
        console.log(`[Core] Shutdown sequence initiated by ${interaction.user.tag}`);
        try {
            await bot.shutdown(0);
        } catch (error: any) {
            console.error('[Core] Error during shutdown sequence:', error);
        } finally {
            process.exit(0);
        }
    }
};

export default command;
