import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
    ChatInputCommandInteraction
} from 'discord.js';
import { Colors, Emojis } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export const memoryCommandData = new SlashCommandBuilder()
    .setName('memory')
    .setDescription('管理派蒙的小本本（旅行者專屬長期記憶）')
    .addSubcommand((sub) =>
        sub.setName('view').setDescription('查看派蒙在小本本裡記了關於你的哪些偏好與事實')
    )
    .addSubcommand((sub) =>
        sub.setName('clear').setDescription('清空派蒙對你的所有記憶（重置小本本）')
    );

export function buildMemoryViewContainer(
    userName: string,
    avatarUrl: string,
    memories: Array<{ id: string; content: string; category?: string; createdAt: number }>
): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(Colors.Primary || 0x5865f2);

    const titleText = `## 📖 派蒙的小本本 (旅行者記憶庫)\n> 這裡記錄著旅行者 **${userName}** 的習慣、偏好與專屬事實。每次你問派蒙時，派蒙都會自動回想起來喔！`;

    const section = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(titleText)
    );
    if (avatarUrl) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    }
    container.addSectionComponents(section);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (memories.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `*唔？派蒙的小本本裡目前還是乾淨的一片呢！*\n*旅行者平時多跟派蒙聊天、分享你的習慣或專案，派蒙就會自動幫你記下來啦！*`
            )
        );
    } else {
        const categoryEmojiMap: Record<string, string> = {
            preference: '⭐',
            habit: '☕',
            project: '🛠️',
            profile: '👤',
            other: '📌'
        };

        const memoryList = memories
            .map((m, index) => {
                const emoji = categoryEmojiMap[m.category || 'other'] || '📌';
                const dateStr = `<t:${Math.floor(m.createdAt / 1000)}:R>`;
                return `**${index + 1}.** ${emoji} ${m.content} -# (${dateStr})`;
            })
            .join('\n');

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### 📝 派蒙記住的事實（共 ${memories.length} 條）：\n${memoryList}`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# 💡 提示：若要抹除記憶，可隨時使用 \`/memory clear\` 或直接在聊天中對派蒙說「忘記我的...」。`
        )
    );

    return container;
}

const memoryCommand: Command = {
    data: memoryCommandData,
    category: 'general',
    cooldown: 3,
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const userName = interaction.user.username;

        const memoryStore = bot?.userMemoryStore;
        if (!memoryStore) {
            return await interaction.reply({
                content: `${Emojis.Error} 記憶系統目前尚未就緒，請稍後再試。`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === 'view') {
            const memories = memoryStore.getMemories(userId);
            const avatarUrl = interaction.user.displayAvatarURL({ size: 128 });
            const container = buildMemoryViewContainer(userName, avatarUrl, memories);

            try {
                return await interaction.reply({
                    components: [container as any],
                    flags: (MessageFlags.Ephemeral | ((MessageFlags as any).IsComponentsV2 ?? 32768)) as any
                });
            } catch (error: any) {
                console.warn('[Memory] Failed to reply with ComponentsV2, falling back to text:', error.message);
                const categoryEmojiMap: Record<string, string> = {
                    preference: '⭐',
                    habit: '☕',
                    project: '🛠️',
                    profile: '👤',
                    other: '📌'
                };
                const memoryList = memories.length === 0
                    ? `*唔？派蒙的小本本裡目前還是乾淨的一片呢！*\n*旅行者平時多跟派蒙聊天、分享你的習慣或專案，派蒙就會自動幫你記下來啦！*`
                    : memories.map((m, i) => `**${i + 1}.** ${categoryEmojiMap[m.category || 'other'] || '📌'} ${m.content}`).join('\n');

                return await interaction.reply({
                    content: `## 📖 派蒙的小本本 (旅行者記憶庫)\n> 旅行者 **${userName}** 的專屬長期記憶：\n\n${memoryList}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (subcommand === 'clear') {
            const hadMemories = memoryStore.getMemories(userId).length > 0;
            memoryStore.clearMemories(userId);

            if (hadMemories) {
                return await interaction.reply({
                    content: `✨ **派蒙已經把小本本裡關於旅行者「${userName}」的記憶全部擦乾淨啦！**\n以後若有想讓派蒙記住的事，隨時跟派蒙說喔！`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                return await interaction.reply({
                    content: `派蒙的小本本裡本來就沒有關於旅行者「${userName}」的記憶記錄喔！`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};

export default memoryCommand;
