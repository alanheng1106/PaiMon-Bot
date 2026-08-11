const Song = require('./Song');

/**
 * GuildQueue — Domain Entity representing a guild's audio playback queue.
 * Encapsulates player instance, song state, loop modes, and concurrency-safe queue mutations.
 * Pure Domain Entity: Does not execute hardware/transport side-effects (e.g. stopTrack).
 */
class GuildQueue {
    #player;
    #songs = [];
    #loopMode = 'none'; // 'none' | 'track' | 'queue'
    #textChannel;
    #voiceChannelId;
    #lastSongIsTTS = false;

    /**
     * @param {Object} player - Shoukaku Player instance
     * @param {Object} [textChannel] - Discord TextChannel for notifications
     * @param {string} [voiceChannelId] - Voice Channel ID
     */
    constructor(player, textChannel = null, voiceChannelId = '') {
        if (!player) throw new Error('[GuildQueue] Player instance is required.');
        this.#player = player;
        this.#textChannel = textChannel;
        this.#voiceChannelId = voiceChannelId;
    }

    get player() {
        return this.#player;
    }

    get textChannel() {
        return this.#textChannel;
    }

    set textChannel(channel) {
        this.#textChannel = channel;
    }

    get voiceChannelId() {
        return this.#voiceChannelId;
    }

    get loopMode() {
        return this.#loopMode;
    }

    // Alias for backward compatibility with commands
    get loop() {
        return this.#loopMode;
    }

    set loop(mode) {
        this.setLoopMode(mode);
    }

    get lastSongIsTTS() {
        return this.#lastSongIsTTS;
    }

    set lastSongIsTTS(val) {
        this.#lastSongIsTTS = Boolean(val);
    }

    /**
     * Set queue loop mode cleanly with validation.
     * @param {'none' | 'track' | 'queue'} mode 
     */
    setLoopMode(mode) {
        const validModes = ['none', 'track', 'queue'];
        if (!validModes.includes(mode)) {
            throw new Error(`[GuildQueue] Invalid loop mode: ${mode}. Allowed: ${validModes.join(', ')}`);
        }
        this.#loopMode = mode;
        return this.#loopMode;
    }

    /**
     * Get a safe snapshot array of currently queued songs.
     * @returns {Array<Song>}
     */
    get songs() {
        return [...this.#songs];
    }

    /**
     * Direct setter for backwards compatibility with commands like shuffle/clear.
     * Normalizes and wraps objects into Song instances internally.
     */
    set songs(newSongs) {
        if (!Array.isArray(newSongs)) {
            throw new Error('[GuildQueue] songs must be an array.');
        }
        this.#songs = newSongs.map((s) => (s instanceof Song ? s : new Song(s)));
    }

    /**
     * Get currently playing song.
     * @returns {Song|null}
     */
    get currentSong() {
        return this.#songs[0] || null;
    }

    get size() {
        return this.#songs.length;
    }

    isEmpty() {
        return this.#songs.length === 0;
    }

    /**
     * Enqueue a single song track.
     * @param {Song|Object} song 
     */
    addTrack(song) {
        if (!song || typeof song !== 'object') {
            throw new Error('[GuildQueue] Invalid song object.');
        }
        const songInstance = song instanceof Song ? song : new Song(song);
        this.#songs.push(songInstance);
    }

    /**
     * Enqueue multiple song tracks.
     * @param {Array<Song|Object>} tracks 
     */
    addPlaylist(tracks) {
        if (!Array.isArray(tracks)) {
            throw new Error('[GuildQueue] tracks must be an array.');
        }
        tracks.forEach((track) => this.addTrack(track));
    }

    /**
     * Priority injection for Text-To-Speech (TTS) audio.
     * Inserts TTS song into queue state cleanly.
     * Returns an instruction object indicating if current playing track requires transport interruption.
     * 
     * @param {Song|Object} ttsSong 
     * @param {number} [currentPosition=0]
     * @returns {{ requiresInterrupt: boolean }}
     */
    insertTTS(ttsSong, currentPosition = 0) {
        const songInstance = ttsSong instanceof Song ? ttsSong : new Song(ttsSong);
        const wasEmpty = this.isEmpty();

        if (wasEmpty) {
            this.#songs.push(songInstance);
            return { requiresInterrupt: false };
        }

        const currentSong = this.#songs[0];
        if (!currentSong.isTTS) {
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
     * @returns {Song|null} The next song to play, or null if queue is empty.
     */
    advance() {
        if (this.isEmpty()) return null;

        const finishedSong = this.#songs[0];
        this.#lastSongIsTTS = Boolean(finishedSong.isTTS);

        if (this.#loopMode === 'track') {
            // Keep song at index 0, replay it
        } else if (this.#loopMode === 'queue' && !finishedSong.isTTS) {
            const song = this.#songs.shift();
            this.#songs.push(song);
        } else {
            this.#songs.shift();
        }

        return this.#songs[0] || null;
    }

    /**
     * Remove next track from queue (skipping).
     * @returns {Song|null}
     */
    shift() {
        return this.#songs.shift() || null;
    }

    /**
     * Randomly shuffle songs in queue (keeping current song at index 0).
     */
    shuffle() {
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
    clear() {
        this.#songs = [];
        this.#loopMode = 'none';
        this.#lastSongIsTTS = false;
    }
}

module.exports = GuildQueue;
