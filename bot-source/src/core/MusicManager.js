const { Music: MusicConfig } = require('../config');
const MusicPresenter = require('./music/MusicPresenter');
const GuildQueue = require('./music/GuildQueue');
const LavalinkService = require('./music/LavalinkService');
const Song = require('./music/Song');

/**
 * MusicManager — Core audio playback and queue domain service.
 * Refactored for clean OOP / SOLID compliance:
 * - UI Card rendering delegated to MusicPresenter (SRP)
 * - Lavalink node management delegated to LavalinkService (SRP / DIP)
 * - Explicit Dependency Injection via constructor contracts (DIP)
 * - Queue state encapsulated within GuildQueue domain entities (Encapsulation / SRP)
 */
class MusicManager {
    #lavalinkService;
    #settingsProvider;
    #queues = new Map();

    /**
     * @param {LavalinkService|Object} lavalinkService - LavalinkService instance
     * @param {Object} [settingsProvider] - Settings provider for volume persistence
     */
    constructor(lavalinkService, settingsProvider = null) {
        if (!lavalinkService) {
            throw new Error('[MusicManager] LavalinkService instance is required.');
        }

        this.#lavalinkService = lavalinkService;
        this.#settingsProvider = settingsProvider;
    }

    get shoukaku() {
        return this.#lavalinkService?.shoukaku || this.#lavalinkService;
    }

    /**
     * Get a guild queue instance (read-only lookup, Encapsulation principle).
     * @param {string} guildId 
     * @returns {GuildQueue|null}
     */
    getQueue(guildId) {
        return this.#queues.get(guildId) || null;
    }

    /**
     * Check if active queue exists for guild.
     * @param {string} guildId 
     * @returns {boolean}
     */
    hasQueue(guildId) {
        return this.#queues.has(guildId);
    }

    async search(query) {
        const shoukaku = this.shoukaku;
        if (!shoukaku) throw new Error('Music servers are currently offline.');
        const node = shoukaku.options.nodeResolver(shoukaku.nodes);
        if (!node) throw new Error('Music servers are currently offline.');

        const searchUrl = query.startsWith('http') ? query : `ytsearch:${query}`;
        const result = await node.rest.resolve(searchUrl);

        if (!result || result.loadType === 'empty' || result.loadType === 'error' || !result.data) {
            return { isPlaylist: false, tracks: [] };
        }
        if (result.loadType === 'playlist') {
            return { isPlaylist: true, name: result.data.info.name, tracks: result.data.tracks };
        }
        return { isPlaylist: false, tracks: result.loadType === 'search' ? result.data : [result.data] };
    }

    async #ensureSession(guild, channelId, textChannel) {
        if (!this.#queues.has(guild.id)) {
            const shoukaku = this.shoukaku;
            if (!shoukaku) throw new Error('Music servers are currently offline.');
            const player = await shoukaku.joinVoiceChannel({
                guildId: guild.id,
                channelId,
                shardId: guild.shardId || 0
            });

            const queue = new GuildQueue(player, textChannel, channelId);

            const next = () => {
                const q = this.#queues.get(guild.id);
                if (!q) return;

                q.advance();
                this.processQueue(guild.id);
            };

            player.on('end', next);
            player.on('error', (err) => {
                console.error('[Play Error]', err);
                next();
            });
            player.on('closed', () => this.#queues.delete(guild.id));

            this.#queues.set(guild.id, queue);

            const savedVolume = this.#settingsProvider?.get(guild.id, 'volume');
            if (savedVolume) player.setGlobalVolume(savedVolume);
        }

        const q = this.#queues.get(guild.id);
        q.textChannel = textChannel;
        return q;
    }

    async processQueue(guildId) {
        const queue = this.#queues.get(guildId);
        if (!queue) return;

        if (queue.isEmpty()) {
            return;
        }

        const song = queue.currentSong;
        if (!song) return;

        try {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            if (song.resumePosition) {
                await queue.player.seekTo(song.resumePosition);
            }
            if (!song.isTTS && !song.resumePosition && queue.loopMode !== 'track') {
                const payload = await MusicPresenter.buildNowPlayingMessage(
                    song,
                    queue.voiceChannelId,
                    (ms) => this.formatDuration(ms)
                );
                queue.textChannel?.send(payload).catch((e) => console.warn('Ignored error:', e.message));
            }
        } catch (err) {
            console.warn(`[MusicManager] Failed to play track in guild ${guildId}:`, err.message);
            queue.shift();
            setImmediate(() => this.processQueue(guildId));
        }
    }

    async play(voiceChannel, textChannel, track, user, options = {}) {
        const queue = await this.#ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = queue.isEmpty();

        const newSong = Song.fromLavalinkTrack(track, user, options);

        if (options.isTTS && !wasEmpty) {
            const currentPosition = queue.player?.position || 0;
            const { requiresInterrupt } = queue.insertTTS(newSong, currentPosition);
            if (requiresInterrupt && queue.player) {
                queue.player.stopTrack();
            }
            return;
        }

        queue.addTrack(newSong);

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
        else if (!options.isTTS) {
            const payload = await MusicPresenter.buildAddedToQueueMessage(
                track.info,
                queue.size,
                user,
                (ms) => this.formatDuration(ms)
            );
            textChannel.send(payload).catch((e) => console.warn('Ignored error:', e.message));
        }
    }

    async playPlaylist(voiceChannel, textChannel, playlistName, tracks, user) {
        const queue = await this.#ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = queue.isEmpty();

        const songObjects = tracks.map((t) => Song.fromLavalinkTrack(t, user));

        queue.addPlaylist(songObjects);

        const payload = MusicPresenter.buildPlaylistAddedMessage(playlistName, tracks.length, user.tag || user.username || 'User');
        textChannel.send(payload).catch((e) => console.warn('Ignored error:', e.message));

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
    }

    formatDuration(ms) {
        return MusicPresenter.formatDuration(ms);
    }

    createProgressBar(current, total, size = 15) {
        return MusicPresenter.createProgressBar(current, total, size);
    }

    stop(guildId) {
        const q = this.#queues.get(guildId);
        if (q) {
            q.clear();
            if (q.player) {
                q.player.stopTrack();
            }
        }
    }

    skip(guildId) {
        this.#queues.get(guildId)?.player?.stopTrack();
    }

    pause(guildId) {
        this.#queues.get(guildId)?.player?.setPaused(true);
    }

    resume(guildId) {
        this.#queues.get(guildId)?.player?.setPaused(false);
    }

    setVolume(guildId, volume) {
        this.#queues.get(guildId)?.player?.setGlobalVolume(volume);
    }

    async join(voiceChannel, textChannel) {
        return await this.#ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
    }

    leave(guildId) {
        if (this.shoukaku) {
            this.shoukaku.leaveVoiceChannel(guildId);
        }
        this.#queues.delete(guildId);
    }
}

module.exports = MusicManager;
