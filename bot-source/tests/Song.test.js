'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Song = require('../src/core/music/Song');

describe('Song (Immutable Value Object)', () => {
    it('initializes cleanly with valid options and freezes instance', () => {
        const song = new Song({
            title: 'Test Song',
            author: 'Test Artist',
            url: 'https://example.com',
            encoded: 'encoded-track-string',
            duration: 180000,
            thumbnail: 'https://example.com/thumb.jpg',
            requester: { tag: 'User#1234', id: '111' },
            isTTS: false
        });

        assert.equal(song.title, 'Test Song');
        assert.equal(song.author, 'Test Artist');
        assert.equal(song.url, 'https://example.com');
        assert.equal(song.encoded, 'encoded-track-string');
        assert.equal(song.duration, 180000);
        assert.equal(song.thumbnail, 'https://example.com/thumb.jpg');
        assert.equal(song.requester.tag, 'User#1234');
        assert.equal(song.isTTS, false);
        assert.equal(song.resumePosition, 0);

        // Immutability test
        assert.ok(Object.isFrozen(song));
        assert.throws(() => {
            song.title = 'Mutated Title';
        }, TypeError);
    });

    it('rejects initialization when missing required parameters', () => {
        assert.throws(() => new Song({ encoded: 'encoded' }), /Title is required/);
        assert.throws(() => new Song({ title: 'Title' }), /Encoded track string is required/);
    });

    it('creates copy with updated resume position via withResumePosition()', () => {
        const original = new Song({
            title: 'Original Song',
            encoded: 'abc'
        });

        const updated = original.withResumePosition(45000);
        assert.equal(original.resumePosition, 0);
        assert.equal(updated.resumePosition, 45000);
        assert.equal(updated.title, 'Original Song');
        assert.notEqual(original, updated);
    });

    it('builds Song instance using fromLavalinkTrack factory', () => {
        const lavalinkTrack = {
            encoded: 'QnJhbmQgTmV3IFRyYWNr',
            info: {
                title: 'Lavalink Song',
                author: 'Lavalink Artist',
                uri: 'https://youtube.com/watch?v=123',
                length: 240000,
                artworkUrl: 'https://artwork.com/img.png',
                identifier: '123'
            }
        };

        const user = { tag: 'Listener#0001', id: '999' };
        const song = Song.fromLavalinkTrack(lavalinkTrack, user, { isTTS: true });

        assert.equal(song.title, 'Lavalink Song');
        assert.equal(song.author, 'Lavalink Artist');
        assert.equal(song.url, 'https://youtube.com/watch?v=123');
        assert.equal(song.encoded, 'QnJhbmQgTmV3IFRyYWNr');
        assert.equal(song.duration, 240000);
        assert.equal(song.thumbnail, 'https://artwork.com/img.png');
        assert.equal(song.requester.tag, 'Listener#0001');
        assert.equal(song.isTTS, true);
    });
});
