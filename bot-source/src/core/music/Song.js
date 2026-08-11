/**
 * Song — Immutable Domain Value Object representing an audio track.
 * Encapsulates track info, duration, requester metadata, and play state.
 */
class Song {
    #title;
    #author;
    #url;
    #encoded;
    #duration;
    #thumbnail;
    #requester;
    #isTTS;
    #resumePosition;

    /**
     * @param {Object} options 
     * @param {string} options.title 
     * @param {string} [options.author] 
     * @param {string} [options.url] 
     * @param {string} options.encoded 
     * @param {number} [options.duration] 
     * @param {string} [options.thumbnail] 
     * @param {Object} [options.requester] 
     * @param {boolean} [options.isTTS] 
     * @param {number} [options.resumePosition] 
     */
    constructor({ title, author = 'Unknown', url = '', encoded, duration = 0, thumbnail = '', requester = {}, isTTS = false, resumePosition = 0 }) {
        if (!title || typeof title !== 'string') {
            throw new Error('[Song] Title is required and must be a string.');
        }
        if (!encoded || typeof encoded !== 'string') {
            throw new Error('[Song] Encoded track string is required.');
        }

        this.#title = title;
        this.#author = author || 'Unknown';
        this.#url = url || '';
        this.#encoded = encoded;
        this.#duration = typeof duration === 'number' ? Math.max(0, duration) : 0;
        this.#thumbnail = thumbnail || '';
        this.#requester = Object.freeze({
            tag: requester?.tag || 'System',
            id: requester?.id || '0'
        });
        this.#isTTS = Boolean(isTTS);
        this.#resumePosition = typeof resumePosition === 'number' ? Math.max(0, resumePosition) : 0;

        Object.freeze(this);
    }

    get title() { return this.#title; }
    get author() { return this.#author; }
    get url() { return this.#url; }
    get encoded() { return this.#encoded; }
    get duration() { return this.#duration; }
    get thumbnail() { return this.#thumbnail; }
    get requester() { return this.#requester; }
    get isTTS() { return this.#isTTS; }
    get resumePosition() { return this.#resumePosition; }

    /**
     * Creates a new Song instance with updated resume position.
     * @param {number} position 
     * @returns {Song}
     */
    withResumePosition(position) {
        return new Song({
            title: this.#title,
            author: this.#author,
            url: this.#url,
            encoded: this.#encoded,
            duration: this.#duration,
            thumbnail: this.#thumbnail,
            requester: this.#requester,
            isTTS: this.#isTTS,
            resumePosition: position
        });
    }

    /**
     * Factory method to build a Song from a Lavalink Track object and Discord User.
     * @param {Object} track - Lavalink resolve track object
     * @param {Object} [user] - Discord User object
     * @param {Object} [options]
     * @returns {Song}
     */
    static fromLavalinkTrack(track, user = {}, options = {}) {
        if (!track || !track.info || !track.encoded) {
            throw new Error('[Song] Invalid Lavalink track payload.');
        }

        const info = track.info;
        const thumbnail = info.artworkUrl || (info.identifier ? `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg` : '');

        return new Song({
            title: info.title,
            author: info.author,
            url: info.uri || '',
            encoded: track.encoded,
            duration: info.length || 0,
            thumbnail,
            requester: {
                tag: user.tag || user.username || 'System',
                id: user.id || '0'
            },
            isTTS: Boolean(options.isTTS)
        });
    }

    toJSON() {
        return {
            title: this.#title,
            author: this.#author,
            url: this.#url,
            encoded: this.#encoded,
            duration: this.#duration,
            thumbnail: this.#thumbnail,
            requester: this.#requester,
            isTTS: this.#isTTS,
            resumePosition: this.#resumePosition
        };
    }
}

module.exports = Song;
