import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { Colors } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface DisconnectCardParams {
    voiceChannelId: string;
    executorId?: string;
}

export function buildDisconnectCard(params: DisconnectCardParams) {
    const { voiceChannelId, executorId } = params;
    const rejoinButton = new ButtonBuilder()
        .setCustomId(`music:rejoin:${voiceChannelId}`)
        .setLabel('重新召回')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(rejoinButton);

    let descContent = `已退出 **<#${voiceChannelId}>** 語音頻道。\n播放進程已終止，暫存佇列已全數釋放。`;
    if (executorId) {
        descContent += `\n👤 **執行者**：<@${executorId}>`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(Colors.Warning)
        // 1. 上面 Heading
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔇 語音連線已中斷'))
        // 標題與正文的分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 2. 中間 Description
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descContent))
        // 正文與按鈕的分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 下面 Button
        .addActionRowComponents(actionRow);

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('中斷語音連線並清空佇列')
        .setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/disconnect` - 讓機器人離開語音頻道並清空播放佇列',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const voiceChannel = interaction.member.voice.channel;
        const botVoiceChannel = interaction.guild.members.me?.voice.channel;

        // 1. Validation
        if (!botVoiceChannel) {
            return await bot.sendError(interaction, '無連線', '我目前不在任何語音頻道!');
        }

        if (!voiceChannel || botVoiceChannel.id !== voiceChannel.id) {
            return await bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能讓我離開!`
            );
        }

        const targetChannelId = botVoiceChannel.id;
        const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

        try {
            bot.music.leave(interaction.guild.id);

            const payload = buildDisconnectCard({
                voiceChannelId: targetChannelId,
                executorId
            });

            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply(payload);
            } else if (interaction.replied) {
                await interaction.followUp(payload);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload);
            } else if (typeof bot.sendSuccess === 'function') {
                await bot.sendSuccess(interaction, '🔇 斷開連線', '已成功離開語音頻道');
            }
        } catch (err: any) {
            console.error('[Disconnect CMD]', err);
            await bot.sendError(interaction, '斷開失敗', '發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
