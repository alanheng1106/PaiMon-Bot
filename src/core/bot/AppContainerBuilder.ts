import type { Client } from 'discord.js';
import ServiceContainer from '../ServiceContainer';
import AIClient from '../AIClient';
import MusicManager from '../MusicManager';
import LavalinkService from '../music/LavalinkService';
import OpenAICompatibleProvider from '../ai/OpenAICompatibleProvider';
import ModelRegistry from '../ai/ModelRegistry';
import AIChatSessionManager from '../ai/AIChatSessionManager';
import CooldownManager from '../CooldownManager';
import GuildSettings from '../GuildSettings';
import LinkFixer from '../LinkFixer';
import DomainRegistry from '../linkfixer/DomainRegistry';
import FilePromptProvider from '../ai/FilePromptProvider';
import ToolRegistry from '../tools/ToolRegistry';
import GetCurrentTimeTool from '../tools/GetCurrentTimeTool';
import CreateFileTool from '../tools/CreateFileTool';
import WebSearchTool from '../tools/WebSearchTool';
import ReadWebPageTool from '../tools/ReadWebPageTool';
import CalculatorTool from '../tools/CalculatorTool';
import CodeRunnerTool from '../tools/CodeRunnerTool';
import InspectCodeTool from '../tools/InspectCodeTool';
import RememberFactTool from '../tools/RememberFactTool';
import ForgetFactTool from '../tools/ForgetFactTool';
import LargeFileCache from '../ai/LargeFileCache';
import UserMemoryStore from '../ai/UserMemoryStore';
import MemoryReflector from '../ai/MemoryReflector';
import ComponentRouter from '../components/ComponentRouter';
import ModUnbanButtonHandler from '../components/ModUnbanButtonHandler';
import ModBanButtonHandler from '../components/ModBanButtonHandler';
import ModHistoryButtonHandler from '../components/ModHistoryButtonHandler';
import ModClearWarnsButtonHandler from '../components/ModClearWarnsButtonHandler';
import ModUnlockButtonHandler from '../components/ModUnlockButtonHandler';
import ModLockButtonHandler from '../components/ModLockButtonHandler';
import ModRenameButtonHandler from '../components/ModRenameButtonHandler';
import ModSlowmodeButtonHandler from '../components/ModSlowmodeButtonHandler';
import ModUntimeoutButtonHandler from '../components/ModUntimeoutButtonHandler';
import ModTimeoutButtonHandler from '../components/ModTimeoutButtonHandler';
import TTSUnbindButtonHandler from '../components/TTSUnbindButtonHandler';
import TTSTestButtonHandler from '../components/TTSTestButtonHandler';
import TTSStopButtonHandler from '../components/TTSStopButtonHandler';
import TTSReplayButtonHandler from '../components/TTSReplayButtonHandler';
import MusicRejoinButtonHandler from '../components/MusicRejoinButtonHandler';
import MusicDisconnectButtonHandler from '../components/MusicDisconnectButtonHandler';
import MusicPlayModalButtonHandler from '../components/MusicPlayModalButtonHandler';
import MusicPlayModalSubmitHandler from '../components/MusicPlayModalSubmitHandler';
import MusicLoopButtonHandler from '../components/MusicLoopButtonHandler';
import MusicPauseButtonHandler from '../components/MusicPauseButtonHandler';
import MusicSkipButtonHandler from '../components/MusicSkipButtonHandler';
import MusicQueueButtonHandler from '../components/MusicQueueButtonHandler';
import MusicVolumeButtonHandler from '../components/MusicVolumeButtonHandler';
import ReactionRouter from '../reactions/ReactionRouter';
import DeleteFixedMessageReactionHandler from '../reactions/DeleteFixedMessageReactionHandler';
import RotateProviderReactionHandler from '../reactions/RotateProviderReactionHandler';

import ImageSynthesisService from '../ai/ImageSynthesisService';
import GenerateImageTool from '../tools/GenerateImageTool';

/**
 * AppContainerBuilder — Composition Root / IoC Container Factory.
 * Centralizes application service wire-up for clean Dependency Inversion (DIP).
 */
class AppContainerBuilder {
    /**
     * Builds and registers default application services into a ServiceContainer.
     * @param client - Optional Discord Client for service listeners
     */
    static buildDefaultContainer(client: Client | null = null): ServiceContainer {
        const container = new ServiceContainer();

        container.register('domainRegistry', () => new DomainRegistry());
        container.register('linkFixer', (c: ServiceContainer) => new LinkFixer(c.get('domainRegistry')));
        container.register('promptProvider', () => new FilePromptProvider());
        container.register('imageService', () => new ImageSynthesisService());
        container.register('largeFileCache', () => new LargeFileCache());
        container.register('userMemoryStore', () => new UserMemoryStore());
        container.register('toolRegistry', (c: ServiceContainer) => {
            const registry = new ToolRegistry();
            registry.register(new GetCurrentTimeTool());
            registry.register(new CreateFileTool());
            registry.register(new ReadWebPageTool());
            registry.register(new CalculatorTool());
            registry.register(new CodeRunnerTool());
            registry.register(new InspectCodeTool());
            const memoryStore = c.get('userMemoryStore');
            registry.register(new RememberFactTool(memoryStore));
            registry.register(new ForgetFactTool(memoryStore));
            const imageService = c.get('imageService');
            if (imageService && imageService.ready) {
                registry.register(new GenerateImageTool(imageService));
            }
            if (process.env.SERPER_API_KEY) {
                registry.register(new WebSearchTool());
            }
            return registry;
        });

        container.register('settings', () => new GuildSettings());
        container.register('gatewayProvider', () => new OpenAICompatibleProvider());
        // llmProvider alias for strategy compatibility
        container.register('llmProvider', (c: ServiceContainer) => c.get('gatewayProvider'));
        container.register('friendProvider', (c: ServiceContainer) => c.get('gatewayProvider'));

        container.register('modelRegistry', (c: ServiceContainer) => {
            const registry = new ModelRegistry(c.get('settings'));
            const gatewayProvider = c.get('gatewayProvider');

            // ─── 平台一：VTC GenAI ─────────────────────────────
            registry.registerModel({
                id: 'vtc-deepseek',
                name: 'DeepSeek-V4 Pro Thinking (VTC 網關)',
                providerKey: 'vtc',
                model: 'deepseek-v4-pro-thinking',
                provider: gatewayProvider,
                description: 'VTC GenAI (旗艦級長思維鏈深度推理)',
                supportsVision: false,
                isDefault: true
            });

            registry.registerModel({
                id: 'vtc-gemini',
                name: 'Gemini 3.8 Flash (VTC 網關)',
                providerKey: 'vtc',
                model: 'gemini-3.8-flash',
                provider: gatewayProvider,
                description: 'VTC GenAI (極速即時多模態回應)',
                supportsVision: true,
                isDefault: false
            });

            registry.registerModel({
                id: 'vtc-gpt',
                name: 'GPT-5.4 (VTC 網關)',
                providerKey: 'vtc',
                model: 'gpt-5.4',
                provider: gatewayProvider,
                description: 'VTC GenAI (次世代旗艦全方位智慧模型)',
                supportsVision: true,
                isDefault: false
            });

            registry.registerModel({
                id: 'vtc-qwen',
                name: 'Qwen 3.7 Max (VTC 網關)',
                providerKey: 'vtc',
                model: 'qwen3.7-max',
                provider: gatewayProvider,
                description: 'VTC GenAI (旗艦長文本綜合大模型)',
                supportsVision: true,
                isDefault: false
            });

            // ─── 平台二：MeowAI ─────────────────────────────────
            registry.registerModel({
                id: 'meowai-grok-4.7',
                name: 'Grok 4.7 (MeowAI 旗艦)',
                providerKey: 'meowai',
                model: 'meowai/grok-4.7',
                provider: gatewayProvider,
                description: 'xAI 最新世代旗艦對話與深度推理模型',
                isDefault: false
            });

            registry.registerModel({
                id: 'meowai-gpt-6.1-sol',
                name: 'GPT-6.1 Sol (MeowAI 旗艦)',
                providerKey: 'meowai',
                model: 'meowai-gpt/gpt-6.1-sol',
                provider: gatewayProvider,
                description: 'MeowAI 次世代超強多模態旗艦模型',
                supportsVision: true,
                isDefault: false
            });

            // ─── 平台三：Ollama / LM Studio ─────────────────────
            registry.registerModel({
                id: 'ol-gpt-oss-120b',
                name: 'GPT-OSS 120B (開源)',
                providerKey: 'lmstudio',
                model: 'ol/gpt-oss:120b',
                provider: gatewayProvider,
                description: '開源 120B 大規模全功能模型',
                isDefault: false
            });

            return registry;
        });

        container.register(
            'sessionManager',
            (c: ServiceContainer) =>
                new AIChatSessionManager({
                    promptProvider: c.get('promptProvider')
                })
        );

        container.register(
            'ai',
            (c: ServiceContainer) =>
                new AIClient({
                    llmProvider: c.get('llmProvider'),
                    modelRegistry: c.get('modelRegistry'),
                    settings: c.get('settings'),
                    toolRegistry: c.get('toolRegistry'),
                    promptProvider: c.get('promptProvider'),
                    imageService: c.get('imageService'),
                    sessionManager: c.get('sessionManager'),
                    userMemoryStore: c.get('userMemoryStore')
                })
        );

        container.register(
            'memoryReflector',
            (c: ServiceContainer) => new MemoryReflector(c.get('userMemoryStore'), c.get('llmProvider'))
        );

        container.register('lavalinkService', () => {
            const service = new LavalinkService();
            if (client) {
                service.initialize(client);
            }
            return service;
        });

        container.register(
            'music',
            (c: ServiceContainer) => new MusicManager(c.get('lavalinkService'), c.get('settings'))
        );
        container.register('cooldowns', () => new CooldownManager());

        container.register('components', () => {
            const router = new ComponentRouter();
            router.register(new ModUnbanButtonHandler());
            router.register(new ModBanButtonHandler());
            router.register(new ModHistoryButtonHandler());
            router.register(new ModClearWarnsButtonHandler());
            router.register(new ModUnlockButtonHandler());
            router.register(new ModLockButtonHandler());
            router.register(new ModRenameButtonHandler());
            router.register(new ModSlowmodeButtonHandler());
            router.register(new ModUntimeoutButtonHandler());
            router.register(new ModTimeoutButtonHandler());
            router.register(new TTSUnbindButtonHandler());
            router.register(new TTSTestButtonHandler());
            router.register(new TTSStopButtonHandler());
            router.register(new TTSReplayButtonHandler());
            router.register(new MusicRejoinButtonHandler());
            router.register(new MusicDisconnectButtonHandler());
            router.register(new MusicPlayModalButtonHandler());
            router.register(new MusicPlayModalSubmitHandler());
            router.register(new MusicLoopButtonHandler());
            router.register(new MusicPauseButtonHandler());
            router.register(new MusicSkipButtonHandler());
            router.register(new MusicQueueButtonHandler());
            router.register(new MusicVolumeButtonHandler());
            return router;
        });
        container.register('reactionRouter', (c: ServiceContainer) => {
            const linkFixer = c.get('linkFixer');
            return new ReactionRouter([
                new DeleteFixedMessageReactionHandler(linkFixer),
                new RotateProviderReactionHandler(linkFixer)
            ]);
        });

        return container;
    }
}

export default AppContainerBuilder;
