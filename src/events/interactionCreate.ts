import { Events, MessageFlags, Interaction } from 'discord.js';
import type BotClient from '../core/BotClient';
import type { BotEvent } from '../types';

const interactionCreateEvent: BotEvent = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction, bot: BotClient) {
        // ─── Slash Commands & Context Menu Commands ─────────────
        if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
            const command = bot.commands.get(interaction.commandName);
            if (!command) return;

            // Cooldown check
            if (command.cooldown) {
                const remaining = bot.cooldowns.check(interaction.commandName, interaction.user.id, command.cooldown);
                if (remaining) {
                    return interaction.reply({
                        content: `⏳ 冷卻中! 請等待 **${remaining}** 秒後再試.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await command.execute(interaction, bot);
            } catch (error: any) {
                console.error(`[Exec: ${interaction.commandName}] Failed:`, error.message);
                const errorPayload = {
                    embeds: [
                        { title: '發生未預期的錯誤', description: '指令執行時出了點問題, 請稍後再試.', color: 0xed4245 }
                    ],
                    flags: MessageFlags.Ephemeral as any
                };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorPayload).catch(() => {});
                } else {
                    await bot.sendError(interaction, '發生未預期的錯誤', '指令執行時出了點問題, 請稍後再試.');
                }
            }
            return;
        }

        // ─── Buttons, Modals, & Component Routing ───────────────
        if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
            try {
                await bot.components.handle(interaction, bot);
            } catch (error: any) {
                console.error('[Component] Failed:', error.message);
                const errorPayload = {
                    embeds: [
                        { title: '處理失敗', description: '處理組件互動時出了點問題, 請稍後再試.', color: 0xed4245 }
                    ],
                    flags: MessageFlags.Ephemeral as any
                };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorPayload).catch(() => {});
                } else {
                    await bot.sendError(interaction, '處理失敗', '處理組件互動時出了點問題, 請稍後再試.');
                }
            }
        }
    }
};

export default interactionCreateEvent;
