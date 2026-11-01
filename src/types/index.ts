import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import type ServiceContainer from '../core/ServiceContainer';
import type BotClient from '../core/BotClient';
import type MusicManager from '../core/MusicManager';
import type AIClient from '../core/AIClient';
import type LavalinkService from '../core/music/LavalinkService';
import type GuildSettings from '../core/GuildSettings';
import type CooldownManager from '../core/CooldownManager';
import type LinkFixer from '../core/LinkFixer';
import type ComponentRouter from '../core/components/ComponentRouter';

import type ModelRegistry from '../core/ai/ModelRegistry';
import type ILLMProvider from '../core/ai/ILLMProvider';
import type OpenAICompatibleProvider from '../core/ai/OpenAICompatibleProvider';
import type ImageSynthesisService from '../core/ai/ImageSynthesisService';
import type UserMemoryStore from '../core/ai/UserMemoryStore';
import type MemoryReflector from '../core/ai/MemoryReflector';

export interface ServiceMap {
    music: MusicManager;
    ai: AIClient;
    lavalinkService: LavalinkService;
    settings: GuildSettings;
    cooldowns: CooldownManager;
    linkFixer: LinkFixer;
    components: ComponentRouter;
    modelRegistry: ModelRegistry;
    llmProvider: ILLMProvider;
    gatewayProvider: OpenAICompatibleProvider;
    imageService: ImageSynthesisService;
    userMemoryStore: UserMemoryStore;
    memoryReflector: MemoryReflector;
}

export type SlashCommandData =
    SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | any;

export interface Command {
    data: SlashCommandData;
    category: string;
    cooldown?: number;
    helpText?: string;
    container?: ServiceContainer;
    configure?(container: ServiceContainer): void;
    execute(interaction: ChatInputCommandInteraction | any, bot?: BotClient | any): Promise<any> | any;
    [key: string]: any;
}

export interface BotEvent {
    name: string;
    once?: boolean;
    execute(...args: any[]): Promise<any> | any;
}
