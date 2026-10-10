import { Shoukaku, Connectors } from 'shoukaku';
import type { Client } from 'discord.js';
import { Music as MusicConfig } from '../../config';

/**
 * LavalinkService — Infrastructure service responsible for Lavalink node configuration,
 * Shoukaku connector lifecycle, and connection health monitoring.
 * Decouples audio networking from MusicManager domain logic (SRP / DIP).
 */
class LavalinkService {
    #shoukaku: Shoukaku | null = null;

    /**
     * Initialize Lavalink Shoukaku instance attached to Discord.js Client.
     * Shoukaku's DiscordJS connector internally calls connector.listen(nodes) which
     * hooks into the Discord 'ready' event to set the client ID and add all nodes
     * automatically. No manual node management is needed here.
     */
    initialize(discordClient: Client, customNodes: any[] | null = null): Shoukaku | null {
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

        // Shoukaku constructor calls connector.listen(nodes) internally, which hooks
        // into Discord's 'ready' event to add nodes — no manual addNode() needed.
        this.#shoukaku = new Shoukaku(new Connectors.DiscordJS(discordClient), nodes, {
            moveOnDisconnect: true,
            reconnectTries: MusicConfig.ReconnectTries,
            // IMPORTANT: Shoukaku 4.x reconnectInterval is in SECONDS, not milliseconds
            reconnectInterval: Math.round(MusicConfig.ReconnectIntervalMs / 1000)
        });

        (this.#shoukaku as any).on('error', (node: any, err: any) =>
            console.warn(`[Lavalink Node Error] ${node}: ${err?.stack || err?.message || err}`)
        );
        (this.#shoukaku as any).on('ready', (node: any) => console.log(`[Lavalink] Audio Node Synced: ${node}`));
        (this.#shoukaku as any).on('close', (node: any, code: any, reason: any) =>
            console.warn(`[Lavalink Node Closed] ${node}: code ${code}, reason: ${reason}`)
        );
        (this.#shoukaku as any).on('disconnect', (node: any, count: any, expected: any) =>
            console.warn(`[Lavalink Node Disconnected] ${node}: count ${count}, expected: ${expected}`)
        );
        (this.#shoukaku as any).on('reconnect', (node: any) => console.log(`[Lavalink Node Reconnecting] ${node}...`));

        // If client is already ready, Shoukaku's connector.listen() clientReady listener won't fire.
        // Manually trigger connector.ready(nodes) to initiate node connections.
        if (discordClient.isReady?.()) {
            (this.#shoukaku.connector as any)?.ready(nodes);
        }

        return this.#shoukaku;
    }

    get shoukaku(): Shoukaku | null {
        return this.#shoukaku;
    }
}

export default LavalinkService;
