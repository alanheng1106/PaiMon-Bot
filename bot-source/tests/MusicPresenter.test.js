const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const MusicPresenter = require('../src/core/music/MusicPresenter');

describe('MusicPresenter (UI Presentation Layer)', () => {
    it('builds now playing message payload cleanly', async () => {
        const mockSong = {
            title: 'Test Song',
            author: 'Test Artist',
            duration: 180000,
            url: 'https://youtube.com/watch?v=12345',
            thumbnail: 'https://img.youtube.com/vi/12345/hqdefault.jpg',
            requester: { id: '999' }
        };

        const payload = await MusicPresenter.buildNowPlayingMessage(mockSong, '111222333', (ms) => '3:00');
        assert.ok(payload.components);
        assert.equal(payload.components.length, 1);
    });

    it('builds playlist added message payload', () => {
        const payload = MusicPresenter.buildPlaylistAddedMessage('Anime OST', 12, 'User#0001');
        assert.ok(payload.components);
        assert.equal(payload.components.length, 1);
    });
});
