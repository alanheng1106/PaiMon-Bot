export interface RequesterInfo {
    readonly tag: string;
    readonly id: string;
}

export interface SongOptions {
    title: string;
    author?: string;
    url?: string;
    encoded: string;
    duration?: number;
    thumbnail?: string;
    requester?: Partial<RequesterInfo>;
    isTTS?: boolean;
    resumePosition?: number;
}

/**
 * Song — Immutable Domain Value Object representing an audio track.
 * Encapsulates track info, duration, requester metadata, and play state.
 */
class Song {
    #title: string;
    #author: string;
    #url: string;
    #encoded: string;
    #duration: number;
    #thumbnail: string;
    #requester: RequesterInfo;
    #isTTS: boolean;
    #resumePosition: number;

    constructor({
        title,
        author = 'Unknown',
        url = '',
        encoded,
        duration = 0,
        thumbnail = '',
        requester = {},
        isTTS = false,
        resumePosition = 0
    }: SongOptions) {
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

    get title(): string {
        return this.#title;
    }
    get author(): string {
        return this.#author;
    }
    get url(): string {
        return this.#url;
    }
    get encoded(): string {
        return this.#encoded;
    }
    get duration(): number {
        return this.#duration;
    }
    get thumbnail(): string {
        return this.#thumbnail;
    }
    get requester(): RequesterInfo {
        return this.#requester;
    }
    get isTTS(): boolean {
        return this.#isTTS;
    }
    get resumePosition(): number {
        return this.#resumePosition;
    }

    /**
     * Creates a new Song instance with updated resume position.
     */
    withResumePosition(position: number): Song {
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
     */
    static fromLavalinkTrack(track: any, user: any = {}, options: { isTTS?: boolean } = {}): Song {
        if (!track || !track.info || !track.encoded) {
            throw new Error('[Song] Invalid Lavalink track payload.');
        }

        const info = track.info;
        const thumbnail =
            info.artworkUrl || (info.identifier ? `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg` : '');

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

    toJSON(): SongOptions {
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

export default Song;
