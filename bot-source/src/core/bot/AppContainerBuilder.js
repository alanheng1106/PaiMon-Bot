const ServiceContainer = require('../ServiceContainer');
const AIClient = require('../AIClient');
const ValorantClient = require('../ValorantClient');
const MusicManager = require('../MusicManager');
const LavalinkService = require('../music/LavalinkService');
const OllamaProvider = require('../ai/OllamaProvider');
const ImageSynthesisService = require('../ai/ImageSynthesisService');
const AIChatSessionManager = require('../ai/AIChatSessionManager');
const FileSessionRepository = require('../valorant/FileSessionRepository');
const RiotAuthenticator = require('../valorant/RiotAuthenticator');
const ValorantStoreService = require('../valorant/ValorantStoreService');
const CooldownManager = require('../CooldownManager');
const GuildSettings = require('../GuildSettings');
const LinkFixer = require('../LinkFixer');
const DomainRegistry = require('../linkfixer/DomainRegistry');
const FilePromptProvider = require('../ai/FilePromptProvider');
const ToolRegistry = require('../tools/ToolRegistry');
const GetCurrentTimeTool = require('../tools/GetCurrentTimeTool');
const CreateFileTool = require('../tools/CreateFileTool');
const WebSearchTool = require('../tools/WebSearchTool');
const ComponentRouter = require('../components/ComponentRouter');
const ValUrlButtonHandler = require('../components/ValUrlButtonHandler');
const ValUrlModalHandler = require('../components/ValUrlModalHandler');
const ReactionRouter = require('../reactions/ReactionRouter');
const DeleteFixedMessageReactionHandler = require('../reactions/DeleteFixedMessageReactionHandler');
const RotateProviderReactionHandler = require('../reactions/RotateProviderReactionHandler');

/**
 * AppContainerBuilder — Composition Root / IoC Container Factory.
 * Centralizes application service wire-up for clean Dependency Inversion (DIP).
 */
class AppContainerBuilder {
    /**
     * Builds and registers default application services into a ServiceContainer.
     * @param {Object} [client] - Optional Discord Client for service listeners
     * @returns {ServiceContainer}
     */
    static buildDefaultContainer(client = null) {
        const container = new ServiceContainer();

        container.register('domainRegistry', () => new DomainRegistry());
        container.register('linkFixer', (c) => new LinkFixer(c.get('domainRegistry')));
        container.register('promptProvider', () => new FilePromptProvider());
        container.register('toolRegistry', () => {
            const registry = new ToolRegistry();
            registry.register(new GetCurrentTimeTool());
            registry.register(new CreateFileTool());
            if (process.env.SERPER_API_KEY) {
                registry.register(new WebSearchTool());
            }
            return registry;
        });

        container.register('imageService', () => new ImageSynthesisService());
        container.register('llmProvider', () => new OllamaProvider());
        container.register('sessionManager', (c) => new AIChatSessionManager({
            promptProvider: c.get('promptProvider')
        }));

        container.register('ai', (c) => new AIClient({
            llmProvider: c.get('llmProvider'),
            toolRegistry: c.get('toolRegistry'),
            promptProvider: c.get('promptProvider'),
            imageService: c.get('imageService'),
            sessionManager: c.get('sessionManager')
        }));

        container.register('lavalinkService', () => {
            const service = new LavalinkService();
            if (client) {
                service.initialize(client);
            }
            return service;
        });

        container.register('settings', () => new GuildSettings());
        container.register('music', (c) => new MusicManager(c.get('lavalinkService'), c.get('settings')));
        container.register('cooldowns', () => new CooldownManager());
        
        container.register('valSessionRepo', () => new FileSessionRepository());
        container.register('valAuthenticator', () => new RiotAuthenticator());
        container.register('valStoreService', () => new ValorantStoreService());

        container.register('valorant', (c) => new ValorantClient({
            sessionRepo: c.get('valSessionRepo'),
            authenticator: c.get('valAuthenticator'),
            storeService: c.get('valStoreService')
        }));
        container.register('components', () => {
            const router = new ComponentRouter();
            router.register(new ValUrlButtonHandler());
            router.register(new ValUrlModalHandler());
            return router;
        });
        container.register('reactionRouter', (c) => {
            const linkFixer = c.get('linkFixer');
            return new ReactionRouter([
                new DeleteFixedMessageReactionHandler(linkFixer),
                new RotateProviderReactionHandler(linkFixer)
            ]);
        });

        return container;
    }
}

module.exports = AppContainerBuilder;
