import type { VoiceBasedChannel, User, Guild } from 'discord.js';
import type { Shoukaku } from 'shoukaku';
import MusicPresenter from './music/MusicPresenter';
import GuildQueue from './music/GuildQueue';
import type LavalinkService from './music/LavalinkService';
import Song from './music/Song';
import type GuildSettings from './GuildSettings';

export interface SearchResult {
    isPlaylist: boolean;
    name?: string;
    tracks: any[];
    error?: string;
}

/**
 * MusicManager — Core audio playback and queue domain service.
 * Refactored for clean OOP / SOLID compliance:
 * - UI Card rendering delegated to MusicPresenter (SRP)
 * - Lavalink node management delegated to LavalinkService (SRP / DIP)
 * - Explicit Dependency Injection via constructor contracts (DIP)
 * - Queue state encapsulated within GuildQueue domain entities (Encapsulation / SRP)
 */
class MusicManager {
    #lavalinkService: LavalinkService;
    #settingsProvider: GuildSettings | null;
    #queues = new Map<string, GuildQueue>();

    /**
     * @param lavalinkService - LavalinkService instance
     * @param settingsProvider - Settings provider for volume persistence
     */
    constructor(lavalinkService: LavalinkService, settingsProvider: GuildSettings | null = null) {
        if (!lavalinkService) {
            throw new Error('[MusicManager] LavalinkService instance is required.');
        }

        this.#lavalinkService = lavalinkService;
        this.#settingsProvider = settingsProvider;
    }

    get shoukaku(): Shoukaku | null {
        return this.#lavalinkService?.shoukaku || (this.#lavalinkService as any);
    }

    /**
     * Get a guild queue instance (read-only lookup, Encapsulation principle).
     */
    getQueue(guildId: string): GuildQueue | null {
        return this.#queues.get(guildId) || null;
    }

    /**
     * Check if active queue exists for guild.
     */
    hasQueue(guildId: string): boolean {
        return this.#queues.has(guildId);
    }

    async search(query: string): Promise<SearchResult> {
        const shoukaku = this.shoukaku;
        if (!shoukaku) throw new Error('Music servers are currently offline.');
        const node = shoukaku.options.nodeResolver(shoukaku.nodes);
        if (!node) throw new Error('Music servers are currently offline.');

        const cleanQuery = query.trim().replace(/^<|>$/g, '');

        let searchUrl: string;
        if (cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://')) {
            searchUrl = cleanQuery;
        } else if (cleanQuery.startsWith('sc:') || cleanQuery.startsWith('scsearch:')) {
            const term = cleanQuery.startsWith('sc:') ? cleanQuery.slice(3).trim() : cleanQuery.slice(9).trim();
            searchUrl = `scsearch:${term}`;
        } else if (cleanQuery.startsWith('yt:') || cleanQuery.startsWith('ytsearch:')) {
            const term = cleanQuery.startsWith('yt:') ? cleanQuery.slice(3).trim() : cleanQuery.slice(9).trim();
            searchUrl = `ytsearch:${term}`;
        } else {
            searchUrl = `ytsearch:${cleanQuery}`;
        }

        let result = await node.rest.resolve(searchUrl);

        // If resolving a YouTube URL with a playlist parameter returned empty or error,
        // attempt fallback to clean playlist URL and YouTube Music URL formats
        if (
            (!result || result.loadType === 'empty' || result.loadType === 'error') &&
            /(?:youtube\.com|youtu\.be)\/.*[?&]list=([a-zA-Z0-9_-]+)/i.test(searchUrl)
        ) {
            const match = searchUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
            if (match && match[1]) {
                const playlistId = match[1];
                const fallbackUrls = [
                    `https://www.youtube.com/playlist?list=${playlistId}`,
                    `https://music.youtube.com/playlist?list=${playlistId}`
                ];

                for (const fallbackUrl of fallbackUrls) {
                    if (fallbackUrl === searchUrl) continue;
                    try {
                        const fallbackResult = await node.rest.resolve(fallbackUrl);
                        if (
                            fallbackResult &&
                            fallbackResult.loadType !== 'empty' &&
                            fallbackResult.loadType !== 'error'
                        ) {
                            result = fallbackResult;
                            break;
                        }
                    } catch {
                        // Try next candidate
                    }
                }

                // If native Lavalink playlist resolution still failed (e.g. YouTube layout change breaking plugin parser),
                // fall back to scraping video IDs from playlist HTML and resolving tracks individually via Lavalink.
                if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                    const fallbackData = await this.#fetchYouTubePlaylistFallback(node, playlistId);
                    if (fallbackData && fallbackData.tracks.length > 0) {
                        return fallbackData;
                    }
                }
            }
        }

        if (!result || result.loadType === 'empty' || !result.data) {
            return { isPlaylist: false, tracks: [] };
        }

        if (result.loadType === 'error') {
            const data: any = result.data;
            const rawMessage = data?.message || data?.cause || '音訊載入失敗';
            console.warn(`[MusicManager] Lavalink search error for "${searchUrl}":`, rawMessage);
            const friendly = MusicPresenter.resolveFriendlyTrackError(rawMessage);
            return { isPlaylist: false, tracks: [], error: friendly };
        }

        if (result.loadType === 'playlist') {
            const data: any = result.data;
            return { isPlaylist: true, name: data.info?.name, tracks: data.tracks || [] };
        }

        return { isPlaylist: false, tracks: result.loadType === 'search' ? (result.data as any[]) : [result.data] };
    }

    async #fetchYouTubePlaylistFallback(node: any, playlistId: string): Promise<SearchResult | null> {
        try {
            const url = `https://www.youtube.com/playlist?list=${playlistId}`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            if (!res.ok) return null;

            const html = await res.text();
            const title =
                html.split('<title>')[1]?.split('</title>')[0]?.replace(' - YouTube', '').trim() || '播放清單';

            const idMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
            const uniqueIds = [...new Set(idMatches)].slice(0, 100);

            if (uniqueIds.length === 0) return null;

            const tracks: any[] = [];
            const chunkSize = 6;
            for (let i = 0; i < uniqueIds.length; i += chunkSize) {
                const chunk = uniqueIds.slice(i, i + chunkSize);
                const chunkResults = await Promise.allSettled(
                    chunk.map((id) => node.rest.resolve(`https://www.youtube.com/watch?v=${id}`))
                );
                for (const item of chunkResults) {
                    if (item.status === 'fulfilled' && item.value) {
                        const val = item.value;
                        if (val.loadType === 'track' && val.data) {
                            tracks.push(val.data);
                        } else if (val.loadType === 'search' && Array.isArray(val.data) && val.data.length > 0) {
                            tracks.push(val.data[0]);
                        }
                    }
                }
            }

            if (tracks.length === 0) return null;
            return { isPlaylist: true, name: title, tracks };
        } catch (err: any) {
            console.warn('[MusicManager] YouTube playlist HTML scrape fallback error:', err.message);
            return null;
        }
    }

    async #ensureSession(guild: Guild, channelId: string, textChannel: any): Promise<GuildQueue> {
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

                if (q.isStopped) {
                    q.isStopped = false;
                    return;
                }

                q.advance();
                this.processQueue(guild.id);
            };

            player.on('end', (data: any) => {
                const reason = data?.reason;
                // Exclude replaced (new track playing) and cleanup (node/player destroyed)
                if (reason === 'replaced' || reason === 'cleanup') {
                    return;
                }
                next();
            });

            player.on('exception', (reason: any) => {
                const message = reason?.exception?.message || reason?.message || '音訊載入失敗';
                console.warn(`[Lavalink Track Exception] Guild ${guild.id}:`, message);
                const q = this.#queues.get(guild.id);
                if (q?.textChannel) {
                    const payload = MusicPresenter.buildTrackExceptionMessage(q.currentSong, message);
                    q.textChannel.send(payload).catch(() => {});
                }
                // Do NOT call next() here: Lavalink automatically emits a TrackEndEvent with reason 'loadFailed' after an exception
            });

            player.on('stuck', (data: any) => {
                console.warn(`[Lavalink Track Stuck] Guild ${guild.id}:`, data);
                const q = this.#queues.get(guild.id);
                // Actively stop the stuck track; Lavalink will emit TrackEndEvent to advance cleanly
                q?.player?.stopTrack();
            });

            player.on('closed', () => this.destroyQueue(guild.id));

            this.#queues.set(guild.id, queue);

            const savedVolume = this.#settingsProvider?.get(guild.id, 'volume');
            if (savedVolume) player.setGlobalVolume(savedVolume);
        }

        const queue = this.#queues.get(guild.id)!;
        queue.textChannel = textChannel;
        return queue;
    }

    async processQueue(guildId: string): Promise<void> {
        const queue = this.#queues.get(guildId);
        if (!queue) return;

        if (queue.isStopped) return;

        const song = queue.currentSong;
        if (!song) {
            this.leave(guildId);
            return;
        }

        try {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            if (song.resumePosition && song.resumePosition > 0) {
                await queue.player.seekTo(song.resumePosition);
            }
            if (!song.isTTS && !song.resumePosition && queue.loopMode !== 'track') {
                const payload = await MusicPresenter.buildNowPlayingMessage(song, queue.voiceChannelId, (ms: number) =>
                    this.formatDuration(ms)
                );
                queue.textChannel?.send(payload).catch((e: any) => console.warn('Ignored error:', e.message));
            }
        } catch (err: any) {
            console.warn(`[MusicManager] Failed to play track in guild ${guildId}:`, err.message);
            queue.shift();
            setImmediate(() => this.processQueue(guildId));
        }
    }

    async play(
        voiceChannel: VoiceBasedChannel | any,
        textChannel: any,
        track: any,
        user: User | any,
        options: any = {}
    ): Promise<void> {
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
            const payload = await MusicPresenter.buildAddedToQueueMessage(track.info, queue.size, user, (ms: number) =>
                this.formatDuration(ms)
            );
            textChannel.send(payload).catch((e: any) => console.warn('Ignored error:', e.message));
        }
    }

    async playPlaylist(
        voiceChannel: VoiceBasedChannel | any,
        textChannel: any,
        playlistName: string,
        tracks: any[],
        user: User | any
    ): Promise<void> {
        const queue = await this.#ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = queue.isEmpty();

        const songObjects = tracks.map((t) => Song.fromLavalinkTrack(t, user));

        queue.addPlaylist(songObjects);

        const payload = MusicPresenter.buildPlaylistAddedMessage(
            playlistName,
            tracks.length,
            user.tag || user.username || 'User'
        );
        textChannel.send(payload).catch((e: any) => console.warn('Ignored error:', e.message));

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
    }

    formatDuration(ms: number): string {
        return MusicPresenter.formatDuration(ms);
    }

    createProgressBar(current: number, total: number, size: number = 15): string {
        return MusicPresenter.createProgressBar(current, total, size);
    }

    stop(guildId: string): void {
        const q = this.#queues.get(guildId);
        if (q) {
            q.isStopped = true;
            q.clear();
            if (q.player) {
                q.player.stopTrack();
            }
        }
    }

    skip(guildId: string): void {
        const q = this.#queues.get(guildId);
        if (q) {
            if (q.loopMode === 'track') {
                q.setLoopMode('none');
            }
            q.player?.stopTrack();
        }
    }

    pause(guildId: string): void {
        this.#queues.get(guildId)?.player?.setPaused(true);
    }

    resume(guildId: string): void {
        this.#queues.get(guildId)?.player?.setPaused(false);
    }

    setVolume(guildId: string, volume: number): void {
        this.#queues.get(guildId)?.player?.setGlobalVolume(volume);
    }

    async join(voiceChannel: VoiceBasedChannel | any, textChannel: any): Promise<GuildQueue> {
        return await this.#ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
    }

    destroyQueue(guildId: string): void {
        const q = this.#queues.get(guildId);
        if (q) {
            q.destroy();
            this.#queues.delete(guildId);
        }
    }

    leave(guildId: string): void {
        this.destroyQueue(guildId);
        if (this.shoukaku) {
            this.shoukaku.leaveVoiceChannel(guildId);
        }
    }
}

export default MusicManager;
