const { Shoukaku, Connectors } = require('shoukaku');
const { Music: MusicConfig } = require('../../config');

/**
 * LavalinkService — Infrastructure service responsible for Lavalink node configuration,
 * Shoukaku connector lifecycle, and connection health monitoring.
 * Decouples audio networking from MusicManager domain logic (SRP / DIP).
 */
class LavalinkService {
    #shoukaku = null;

    /**
     * Initialize Lavalink Shoukaku instance attached to Discord.js Client.
     * @param {import('discord.js').Client} discordClient 
     * @param {Array<Object>} customNodes Optional override nodes configuration
     */
    initialize(discordClient, customNodes = null) {
        if (!discordClient) return null;

        const host = process.env.LAVALINK_HOST || 'lavalink';
        const port = process.env.LAVALINK_PORT || '2333';

        const nodes = customNodes || [
            {
                name: 'Docker-Lavalink',
                url: `${host}:${port}`,
                auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
                secure: process.env.LAVALINK_SECURE === 'true'
            }
        ];

        console.log(`[LavalinkService] Initializing node target: ${nodes[0].secure ? 'wss' : 'ws'}://${nodes[0].url}`);

        this.#shoukaku = new Shoukaku(new Connectors.DiscordJS(discordClient), nodes, {
            moveOnDisconnect: true,
            reconnectTries: MusicConfig.ReconnectTries,
            reconnectInterval: MusicConfig.ReconnectIntervalMs
        });

        this.#shoukaku.on('error', (node, err) =>
            console.warn(`[Lavalink Node Error] ${node}: ${err?.stack || err?.message || err}`)
        );
        this.#shoukaku.on('ready', (node) => console.log(`[Lavalink] Audio Node Synced: ${node}`));
        this.#shoukaku.on('close', (node, code, reason) =>
            console.warn(`[Lavalink Node Closed] ${node}: code ${code}, reason: ${reason}`)
        );
        this.#shoukaku.on('disconnect', (node, count, expected) =>
            console.warn(`[Lavalink Node Disconnected] ${node}: count ${count}, expected: ${expected}`)
        );
        this.#shoukaku.on('reconnect', (node) => console.log(`[Lavalink Node Reconnecting] ${node}...`));

        const syncAndAddNodes = () => {
            if (!this.#shoukaku) return;
            if (discordClient.user?.id) {
                this.#shoukaku.id = discordClient.user.id;
            }
            for (const nodeOpt of nodes) {
                if (!this.#shoukaku.nodes.has(nodeOpt.name)) {
                    try {
                        this.#shoukaku.addNode(nodeOpt);
                    } catch (err) {
                        console.warn(`[LavalinkService] Failed to add node ${nodeOpt.name}:`, err.message);
                    }
                }
            }
        };

        if (discordClient.isReady && discordClient.isReady()) {
            syncAndAddNodes();
        } else if (discordClient.once) {
            discordClient.once('clientReady', () => {
                syncAndAddNodes();
            });
        }

        return this.#shoukaku;
    }

    get shoukaku() {
        return this.#shoukaku;
    }
}

module.exports = LavalinkService;
