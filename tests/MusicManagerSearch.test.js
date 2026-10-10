import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MusicManager from '../src/core/MusicManager';

describe('MusicManager.search', () => {
    const createMockLavalink = (resolveFn) => {
        const mockNode = {
            rest: {
                resolve: resolveFn
            }
        };
        return {
            shoukaku: {
                nodes: [mockNode],
                options: {
                    nodeResolver: () => mockNode
                }
            }
        };
    };

    it('cleans Discord angle brackets and resolves url', async () => {
        let requestedUrl = null;
        const mockLavalink = createMockLavalink(async (url) => {
            requestedUrl = url;
            return {
                loadType: 'playlist',
                data: {
                    info: { name: 'My Playlist' },
                    tracks: [{ info: { title: 'T1' } }]
                }
            };
        });

        const manager = new MusicManager(mockLavalink);
        const res = await manager.search('<https://www.youtube.com/playlist?list=PL123>');

        assert.equal(requestedUrl, 'https://www.youtube.com/playlist?list=PL123');
        assert.equal(res.isPlaylist, true);
        assert.equal(res.tracks.length, 1);
    });

    it('falls back to clean playlist URL when watch URL with list fails', async () => {
        const requestedUrls = [];
        const mockLavalink = createMockLavalink(async (url) => {
            requestedUrls.push(url);
            if (url.includes('watch?v=')) {
                return { loadType: 'empty', data: {} };
            }
            return {
                loadType: 'playlist',
                data: {
                    info: { name: 'Extracted Playlist' },
                    tracks: [{ info: { title: 'T1' } }, { info: { title: 'T2' } }]
                }
            };
        });

        const manager = new MusicManager(mockLavalink);
        const res = await manager.search('https://www.youtube.com/watch?v=xyz&list=PL456');

        assert.equal(requestedUrls.length, 2);
        assert.equal(requestedUrls[1], 'https://www.youtube.com/playlist?list=PL456');
        assert.equal(res.isPlaylist, true);
        assert.equal(res.tracks.length, 2);
    });

    it('falls back to music.youtube.com when standard www.youtube.com playlist fails', async () => {
        const requestedUrls = [];
        const mockLavalink = createMockLavalink(async (url) => {
            requestedUrls.push(url);
            if (url.includes('www.youtube.com')) {
                return {
                    loadType: 'error',
                    data: { message: 'Could not find tracks from playlist.' }
                };
            }
            if (url.includes('music.youtube.com')) {
                return {
                    loadType: 'playlist',
                    data: {
                        info: { name: 'YT Music Playlist' },
                        tracks: [{ info: { title: 'Track From YTMusic' } }]
                    }
                };
            }
            return { loadType: 'empty', data: {} };
        });

        const manager = new MusicManager(mockLavalink);
        const res = await manager.search('https://www.youtube.com/playlist?list=PL999');

        assert.equal(requestedUrls.length, 2);
        assert.equal(requestedUrls[0], 'https://www.youtube.com/playlist?list=PL999');
        assert.equal(requestedUrls[1], 'https://music.youtube.com/playlist?list=PL999');
        assert.equal(res.isPlaylist, true);
        assert.equal(res.tracks.length, 1);
        assert.equal(res.tracks[0].info.title, 'Track From YTMusic');
    });

    it('falls back to extracting playlist HTML and resolving tracks when all Lavalink playlist resolvers fail', async () => {
        const resolvedTrackUrls = [];
        const mockLavalink = createMockLavalink(async (url) => {
            if (url.includes('playlist?list=')) {
                return {
                    loadType: 'error',
                    data: { message: 'Could not find tracks from playlist.' }
                };
            }
            if (url.includes('watch?v=')) {
                resolvedTrackUrls.push(url);
                return {
                    loadType: 'track',
                    data: {
                        encoded: 'enc-1',
                        info: { title: `Track for ${url}` }
                    }
                };
            }
            return { loadType: 'empty', data: {} };
        });

        const manager = new MusicManager(mockLavalink);
        const res = await manager.search('https://www.youtube.com/playlist?list=PLmzwpFLympgC5RPgSImfRROsbQyFlDAcg');

        assert.equal(res.isPlaylist, true);
        assert.ok(res.tracks.length > 0);
        assert.ok(resolvedTrackUrls.length > 0);
        assert.match(res.name || '', /方大同|播放清單/);
    });

    it('surfaces friendly error message when Lavalink returns loadType error', async () => {
        const mockLavalink = createMockLavalink(async () => {
            return {
                loadType: 'error',
                data: {
                    message: 'Sign in to confirm your age or bot check'
                }
            };
        });

        const manager = new MusicManager(mockLavalink);
        const res = await manager.search('https://www.youtube.com/playlist?list=PL789');

        assert.equal(res.isPlaylist, false);
        assert.equal(res.tracks.length, 0);
        assert.match(res.error || '', /YouTube 限制/);
    });
});
