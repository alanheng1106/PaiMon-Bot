const { Shoukaku, Connectors } = require('shoukaku');
const { Music: MusicConfig } = require('../config');
const MusicPresenter = require('./music/MusicPresenter');

/**
 * MusicManager — Core audio playback and queue domain service.
 * Refactored for clean OOP / SOLID compliance:
 * - UI Card rendering delegated to MusicPresenter (SRP)
 * - State encapsulated via ES2022 private fields (#)
 * - Decoupled from direct BotClient back-reference (DIP)
 */
class MusicManager {
    #shoukaku;
    #queues = new Map();
    #settingsProvider;

    constructor(botOrShoukaku = null, settingsProvider = null) {
        this.#settingsProvider = settingsProvider || (botOrShoukaku?.settings ? botOrShoukaku.settings : null);

        if (botOrShoukaku && botOrShoukaku.shoukaku) {
            this.#shoukaku = botOrShoukaku.shoukaku;
        } else if (botOrShoukaku && (botOrShoukaku.user || botOrShoukaku.ws || botOrShoukaku.on)) {
            // DiscordJS Client instance
            const host = process.env.LAVALINK_HOST || 'lavalink';
            const port = process.env.LAVALINK_PORT || '2333';
            const nodes = [
                {
                    name: 'Docker-Lavalink',
                    url: `${host}:${port}`,
                    auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
                    secure: process.env.LAVALINK_SECURE === 'true'
                }
            ];

            this.#shoukaku = new Shoukaku(new Connectors.DiscordJS(botOrShoukaku), nodes, {
                moveOnDisconnect: true,
                reconnectTries: MusicConfig.ReconnectTries,
                reconnectInterval: MusicConfig.ReconnectIntervalMs
            });

            this.#shoukaku.on('error', (node, err) => console.warn(`[Node Error] ${node}: ${err.message}`));
            this.#shoukaku.on('ready', (node) => console.log(`[Music] Audio Node Synced: ${node}`));

            if (botOrShoukaku.isReady && botOrShoukaku.isReady()) {
                this.#shoukaku.id = botOrShoukaku.user?.id || null;
                for (const nodeOpt of nodes) {
                    if (!this.#shoukaku.nodes.has(nodeOpt.name)) {
                        this.#shoukaku.addNode(nodeOpt);
                    }
                }
            }
        } else {
            this.#shoukaku = null;
        }
    }

    get shoukaku() {
        return this.#shoukaku;
    }

    get queues() {
        return this.#queues;
    }

    async search(query) {
        if (!this.#shoukaku) throw new Error('Music servers are currently offline.');
        const node = this.#shoukaku.options.nodeResolver(this.#shoukaku.nodes);
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

    async _ensureSession(guild, channelId, textChannel) {
        if (!this.#queues.has(guild.id)) {
            if (!this.#shoukaku) throw new Error('Music servers are currently offline.');
            const player = await this.#shoukaku.joinVoiceChannel({
                guildId: guild.id,
                channelId,
                shardId: guild.shardId || 0
            });

            const next = () => {
                const q = this.#queues.get(guild.id);
                if (!q) return;

                const finishedSong = q.songs[0];
                if (finishedSong) {
                    q.lastSongIsTTS = finishedSong.isTTS;

                    if (q.loop === 'track') {
                        // Keep song at index 0, replay it
                    } else if (q.loop === 'queue' && !finishedSong.isTTS) {
                        q.songs.shift();
                        q.songs.push(finishedSong);
                    } else {
                        q.songs.shift();
                    }
                }
                this.processQueue(guild.id);
            };

            player.on('end', next);
            player.on('error', (err) => {
                console.error('[Play Error]', err);
                next();
            });
            player.on('closed', () => this.#queues.delete(guild.id));

            this.#queues.set(guild.id, { player, songs: [], textChannel, voiceChannelId: channelId, loop: 'none' });

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

        if (!queue.songs.length) {
            return;
        }

        const song = queue.songs[0];
        try {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            if (song.resumePosition) {
                await queue.player.seekTo(song.resumePosition);
            }
            if (!song.isTTS && !song.resumePosition && queue.loop !== 'track') {
                const payload = await MusicPresenter.buildNowPlayingMessage(
                    song,
                    queue.voiceChannelId,
                    (ms) => this.formatDuration(ms)
                );
                queue.textChannel?.send(payload).catch((e) => console.warn('Ignored error:', e.message));
            }
        } catch (err) {
            console.warn(`[MusicManager] Failed to play track in guild ${guildId}:`, err.message);
            queue.songs.shift();
            this.processQueue(guildId);
        }
    }

    async play(voiceChannel, textChannel, track, user, options = {}) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        const newSong = {
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri,
            encoded: track.encoded,
            duration: track.info.length,
            thumbnail: track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg`,
            requester: { tag: user.tag, id: user.id },
            isTTS: options.isTTS || false
        };

        if (options.isTTS && !wasEmpty) {
            if (!queue.songs[0].isTTS) {
                const songToResume = { ...queue.songs[0], resumePosition: queue.player.position || 0 };
                queue.songs.splice(1, 0, newSong, songToResume);
                queue.player.stopTrack();
            } else {
                let insertIndex = 1;
                while (insertIndex < queue.songs.length && queue.songs[insertIndex].isTTS) {
                    insertIndex++;
                }
                queue.songs.splice(insertIndex, 0, newSong);
            }
            return;
        }

        queue.songs.push(newSong);

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
        else if (!options.isTTS) {
            const payload = await MusicPresenter.buildAddedToQueueMessage(
                track.info,
                queue.songs.length,
                user,
                (ms) => this.formatDuration(ms)
            );
            textChannel.send(payload).catch((e) => console.warn('Ignored error:', e.message));
        }
    }

    async playPlaylist(voiceChannel, textChannel, playlistName, tracks, user) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        tracks.forEach((t) =>
            queue.songs.push({
                title: t.info.title,
                author: t.info.author,
                url: t.info.uri,
                encoded: t.encoded,
                duration: t.info.length,
                thumbnail: t.info.artworkUrl || `https://img.youtube.com/vi/${t.info.identifier}/hqdefault.jpg`,
                requester: { tag: user.tag, id: user.id }
            })
        );

        const payload = MusicPresenter.buildPlaylistAddedMessage(playlistName, tracks.length, user.tag);
        textChannel.send(payload).catch((e) => console.warn('Ignored error:', e.message));

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
    }

    formatDuration(ms) {
        if (ms === 0) return '直播流';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const hours = Math.floor(minutes / 60);

        const m = minutes % 60;
        const s = seconds < 10 ? `0${seconds}` : seconds;

        if (hours > 0) return `${hours}:${m < 10 ? `0${m}` : m}:${s}`;
        return `${m}:${s}`;
    }

    createProgressBar(current, total, size = 15) {
        const progress = Math.round((size * current) / total);
        const emptyProgress = size - progress;

        const progressText = '▇'.repeat(Math.max(0, progress));
        const emptyProgressText = '—'.repeat(Math.max(0, emptyProgress));

        return `\`${this.formatDuration(current)}\` [${progressText}🔘${emptyProgressText}] \`${this.formatDuration(total)}\``;
    }

    getQueue(guildId) {
        return this.#queues.get(guildId);
    }

    stop(guildId) {
        const q = this.#queues.get(guildId);
        if (q) {
            q.songs = [];
            q.loop = 'none';
            q.player.stopTrack();
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
        return await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
    }

    leave(guildId) {
        if (this.#shoukaku) {
            this.#shoukaku.leaveVoiceChannel(guildId);
        }
        this.#queues.delete(guildId);
    }
}

module.exports = MusicManager;
