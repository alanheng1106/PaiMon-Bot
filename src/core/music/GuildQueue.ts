import Song from './Song';

export type LoopMode = 'none' | 'track' | 'queue';

/**
 * GuildQueue — Domain Entity representing a guild's audio playback queue.
 * Encapsulates player instance, song state, loop modes, and concurrency-safe queue mutations.
 * Pure Domain Entity: Does not execute hardware/transport side-effects (e.g. stopTrack).
 */
class GuildQueue {
    #player: any;
    #songs: Song[] = [];
    #loopMode: LoopMode = 'none';
    #textChannel: any;
    #voiceChannelId: string;
    #lastSongIsTTS: boolean = false;
    #isInterruptedForTTS: boolean = false;
    #isStopped: boolean = false;
    #nowPlayingTimer: any = null;

    /**
     * @param player - Shoukaku Player instance
     * @param textChannel - Discord TextChannel for notifications
     * @param voiceChannelId - Voice Channel ID
     */
    constructor(player: any, textChannel: any = null, voiceChannelId: string = '') {
        if (!player) throw new Error('[GuildQueue] Player instance is required.');
        this.#player = player;
        this.#textChannel = textChannel;
        this.#voiceChannelId = voiceChannelId;
    }

    get player(): any {
        return this.#player;
    }

    get textChannel(): any {
        return this.#textChannel;
    }

    set textChannel(channel: any) {
        this.#textChannel = channel;
    }

    get voiceChannelId(): string {
        return this.#voiceChannelId;
    }

    get loopMode(): LoopMode {
        return this.#loopMode;
    }

    // Alias for backward compatibility with commands
    get loop(): LoopMode {
        return this.#loopMode;
    }

    set loop(mode: LoopMode) {
        this.setLoopMode(mode);
    }

    get lastSongIsTTS(): boolean {
        return this.#lastSongIsTTS;
    }

    set lastSongIsTTS(val: boolean) {
        this.#lastSongIsTTS = Boolean(val);
    }

    get isInterruptedForTTS(): boolean {
        return this.#isInterruptedForTTS;
    }

    get isStopped(): boolean {
        return this.#isStopped;
    }

    set isStopped(val: boolean) {
        this.#isStopped = Boolean(val);
    }

    #nowPlayingFinalizer: (() => Promise<void> | void) | null = null;

    get nowPlayingTimer(): any {
        return this.#nowPlayingTimer;
    }

    setNowPlayingTimer(timer: any, finalizer?: () => Promise<void> | void): void {
        this.clearNowPlayingTimer();
        this.#nowPlayingTimer = timer;
        this.#nowPlayingFinalizer = finalizer || null;
    }

    clearNowPlayingTimer(): void {
        if (this.#nowPlayingTimer) {
            clearTimeout(this.#nowPlayingTimer);
            clearInterval(this.#nowPlayingTimer);
            this.#nowPlayingTimer = null;
        }
        this.#nowPlayingFinalizer = null;
    }

    finalizeNowPlaying(): void {
        if (this.#nowPlayingFinalizer) {
            try {
                const res = this.#nowPlayingFinalizer();
                if (res && typeof (res as any).catch === 'function') {
                    (res as any).catch(() => {});
                }
            } catch {
                // Ignore finalization errors
            }
            this.#nowPlayingFinalizer = null;
        }
    }

    /**
     * Set queue loop mode cleanly with validation.
     */
    setLoopMode(mode: LoopMode | string): LoopMode {
        const validModes: LoopMode[] = ['none', 'track', 'queue'];
        if (!validModes.includes(mode as LoopMode)) {
            throw new Error(`[GuildQueue] Invalid loop mode: ${mode}. Allowed: ${validModes.join(', ')}`);
        }
        this.#loopMode = mode as LoopMode;
        return this.#loopMode;
    }

    /**
     * Get a safe snapshot array of currently queued songs.
     */
    get songs(): Song[] {
        return [...this.#songs];
    }

    /**
     * Direct setter for backwards compatibility with commands like shuffle/clear.
     * Normalizes and wraps objects into Song instances internally.
     */
    set songs(newSongs: (Song | any)[]) {
        if (!Array.isArray(newSongs)) {
            throw new Error('[GuildQueue] songs must be an array.');
        }
        this.#songs = newSongs.map((s) => (s instanceof Song ? s : new Song(s)));
    }

    /**
     * Get currently playing song.
     */
    get currentSong(): Song | null {
        return this.#songs[0] || null;
    }

    get size(): number {
        return this.#songs.length;
    }

    isEmpty(): boolean {
        return this.#songs.length === 0;
    }

    /**
     * Enqueue a single song track.
     */
    addTrack(song: Song | any): void {
        if (!song || typeof song !== 'object') {
            throw new Error('[GuildQueue] Invalid song object.');
        }
        this.#isStopped = false;
        const songInstance = song instanceof Song ? song : new Song(song);
        this.#songs.push(songInstance);
    }

    /**
     * Enqueue multiple song tracks.
     */
    addPlaylist(tracks: (Song | any)[]): void {
        if (!Array.isArray(tracks)) {
            throw new Error('[GuildQueue] tracks must be an array.');
        }
        tracks.forEach((track) => this.addTrack(track));
    }

    /**
     * Priority injection for Text-To-Speech (TTS) audio.
     * Inserts TTS song into queue state cleanly.
     * Returns an instruction object indicating if current playing track requires transport interruption.
     */
    insertTTS(ttsSong: Song | any, currentPosition: number = 0): { requiresInterrupt: boolean } {
        const songInstance = ttsSong instanceof Song ? ttsSong : new Song(ttsSong);
        const wasEmpty = this.isEmpty();

        if (wasEmpty) {
            this.#songs.push(songInstance);
            return { requiresInterrupt: false };
        }

        const currentSong = this.#songs[0];
        if (!currentSong.isTTS) {
            // 若當前歌曲已處於被 TTS 插播的等待狀態（例如佇列第二首已是 TTS），避免重複建立恢復音軌
            const alreadyInterrupted = this.#songs.length > 1 && this.#songs[1].isTTS;
            if (alreadyInterrupted) {
                let insertIndex = 1;
                while (insertIndex < this.#songs.length && this.#songs[insertIndex].isTTS) {
                    insertIndex++;
                }
                this.#songs.splice(insertIndex, 0, songInstance);
                return { requiresInterrupt: false };
            }

            this.#isInterruptedForTTS = true;
            const songToResume = currentSong.withResumePosition(currentPosition);
            this.#songs.splice(1, 0, songInstance, songToResume);
            return { requiresInterrupt: true };
        } else {
            let insertIndex = 1;
            while (insertIndex < this.#songs.length && this.#songs[insertIndex].isTTS) {
                insertIndex++;
            }
            this.#songs.splice(insertIndex, 0, songInstance);
            return { requiresInterrupt: false };
        }
    }

    /**
     * Advances the queue after a song finishes.
     * Handles loop modes ('none', 'track', 'queue').
     */
    advance(): Song | null {
        if (this.isEmpty()) {
            this.finalizeNowPlaying();
            this.clearNowPlayingTimer();
            return null;
        }

        const finishedSong = this.#songs[0];
        const isInterruption = this.#isInterruptedForTTS;
        this.#isInterruptedForTTS = false;

        const isTTSFinished = Boolean(finishedSong.isTTS);
        this.#lastSongIsTTS = isTTSFinished;

        // 若本次 advance 是因 TTS 插播中斷音樂，或 TTS 廣播結束，不結算或清除原本音樂的 NowPlaying 卡片
        if (!isInterruption && !isTTSFinished) {
            this.finalizeNowPlaying();
            this.clearNowPlayingTimer();
        }

        if (this.#loopMode === 'track' && !isInterruption && !isTTSFinished) {
            // Keep song at index 0, replay it
        } else if (this.#loopMode === 'queue' && !isTTSFinished && !isInterruption) {
            const song = this.#songs.shift()!;
            this.#songs.push(song);
        } else {
            this.#songs.shift();
        }

        return this.#songs[0] || null;
    }

    /**
     * Remove next track from queue (skipping).
     */
    shift(): Song | null {
        this.clearNowPlayingTimer();
        return this.#songs.shift() || null;
    }

    /**
     * Randomly shuffle songs in queue (keeping current song at index 0).
     */
    shuffle(): void {
        if (this.#songs.length <= 1) return;

        const current = this.#songs[0];
        const rest = this.#songs.slice(1);

        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }

        this.#songs = [current, ...rest];
    }

    /**
     * Clear all songs and reset queue state.
     */
    clear(): void {
        this.finalizeNowPlaying();
        this.clearNowPlayingTimer();
        this.#songs = [];
        this.#loopMode = 'none';
        this.#lastSongIsTTS = false;
        this.#isInterruptedForTTS = false;
    }
}

export default GuildQueue;
