import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    RepliableInteraction
} from 'discord.js';
import { Colors, Emojis } from '../../config';

/**
 * BotResponsePresenter — Encapsulates UI response component formatting and delivery.
 * Refactored for Presentation Layer separation and Single Responsibility Principle (SRP).
 */
class BotResponsePresenter {
    /**
     * Send Error / Restriction response container to interaction.
     */
    static async sendError(interaction: RepliableInteraction | any, title: string, description: string): Promise<void> {
        const cleanTitle = title.replace(/^\s*(?:<a?:\w+:\d+>|\p{Extended_Pictographic})*\s*/gu, '').trim();

        // Contextual icon resolution: use custom uploaded cross for errors and warnings
        let icon: string = Emojis.Error;
        let accentColor: number = 0xda373c; // Sleek Discord Danger Red

        if (/權限|受限|溢位|拒絕/.test(cleanTitle)) {
            icon = '🛡️';
            accentColor = 0xda373c;
        } else if (/未在|不在|名單|查無|找不到|格式/.test(cleanTitle)) {
            icon = '🔍';
            accentColor = Colors.Warning;
        } else if (/失敗|錯誤|未預期|異常/.test(cleanTitle)) {
            icon = Emojis.Error;
            accentColor = 0xda373c;
        } else if (/無法|無效|衝突/.test(cleanTitle)) {
            icon = Emojis.Error;
            accentColor = Colors.Warning;
        }

        // Format description as clean plain text without blockquote rail
        const formattedBody = description
            .split('\n')
            .map((line) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim();

        // Contextual subtext footer if not already provided
        let tipText = '';
        if (!description.includes('-#')) {
            if (/未在.*名單|不在.*名單|名單/.test(cleanTitle)) {
                tipText = '\n\n-# 💡 該成員目前未處於封鎖狀態，可能已被其他管理員解封或從未被封鎖。';
            } else if (/權限|受限|溢位/.test(cleanTitle)) {
                tipText = '\n\n-# 🛡️ 操作已被安全防護機制攔截，未對伺服器產生任何變更。';
            } else if (/查無|找不到/.test(cleanTitle)) {
                tipText = '\n\n-# 💡 請確認目標對象是否存在於此伺服器中。';
            } else if (/格式|無效/.test(cleanTitle)) {
                tipText = '\n\n-# 💡 請確認輸入的指令參數格式是否正確。';
            } else if (/失敗|錯誤/.test(cleanTitle)) {
                tipText = '\n\n-# 💡 若問題持續發生，請稍後重試或回報給伺服器管理員。';
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon} ${cleanTitle}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${formattedBody}${tipText}`));

        const payload = { components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
        try {
            if (interaction.deferred && !interaction.replied) {
                try {
                    await interaction.editReply(payload);
                } catch (editErr: any) {
                    if (editErr.code === 10008 || editErr.message?.includes('Unknown Message')) {
                        await interaction.followUp(payload);
                    } else {
                        throw editErr;
                    }
                }
            } else if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload);
            } else {
                await interaction.reply(payload);
            }
        } catch (err: any) {
            console.warn('[BotResponsePresenter] Failed to deliver error response:', err.message);
        }
    }

    /**
     * Send Success response container to interaction.
     */
    static async sendSuccess(
        interaction: RepliableInteraction | any,
        title: string,
        description: string,
        ephemeral: boolean = false
    ): Promise<void> {
        const cleanTitle = title.replace(/^\s*(?:<a?:\w+:\d+>|\p{Extended_Pictographic})*\s*/gu, '').trim();

        const formattedBody = description
            .split('\n')
            .map((line) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim();

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Success)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${Emojis.Success} ${cleanTitle}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(formattedBody));

        const flags = (ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2;
        const payload = { components: [container], flags };
        try {
            if (interaction.deferred && !interaction.replied) {
                try {
                    await interaction.editReply(payload);
                } catch (editErr: any) {
                    if (editErr.code === 10008 || editErr.message?.includes('Unknown Message')) {
                        await interaction.followUp(payload);
                    } else {
                        throw editErr;
                    }
                }
            } else if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload);
            } else {
                await interaction.reply(payload);
            }
        } catch (err: any) {
            console.warn('[BotResponsePresenter] Failed to deliver success response:', err.message);
        }
    }
}

export default BotResponsePresenter;
