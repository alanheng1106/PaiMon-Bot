'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GuildQueue = require('../src/core/music/GuildQueue');
const Song = require('../src/core/music/Song');

describe('GuildQueue (Domain Entity)', () => {
    class MockPlayer {
        constructor() {
            this.position = 5000;
            this.stopped = false;
        }
        stopTrack() {
            this.stopped = true;
        }
    }

    it('initializes cleanly and rejects null player', () => {
        assert.throws(() => new GuildQueue(null, {}, 'vc-1'), /Player instance is required/);

        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');
        assert.equal(queue.voiceChannelId, 'vc-1');
        assert.equal(queue.size, 0);
        assert.equal(queue.isEmpty(), true);
    });

    it('enqueues songs and provides immutable snapshots', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song A', encoded: 'enc-a', duration: 1000 });
        assert.equal(queue.size, 1);
        assert.equal(queue.currentSong.title, 'Song A');

        // Verify immutability of Song snapshot
        const songsCopy = queue.songs;
        assert.ok(Object.isFrozen(songsCopy[0]));
        assert.throws(() => {
            songsCopy[0].title = 'Mutated Title';
        }, TypeError);

        assert.equal(queue.currentSong.title, 'Song A');
    });

    it('handles loop mode transitions correctly', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song 1', encoded: 'enc-1' });
        queue.addTrack({ title: 'Song 2', encoded: 'enc-2' });

        // Loop 'none'
        queue.setLoopMode('none');
        const next = queue.advance();
        assert.equal(next.title, 'Song 2');
        assert.equal(queue.size, 1);

        // Loop 'track'
        queue.setLoopMode('track');
        const current = queue.advance();
        assert.equal(current.title, 'Song 2');
        assert.equal(queue.size, 1);

        // Loop 'queue'
        queue.setLoopMode('queue');
        queue.addTrack({ title: 'Song 3', encoded: 'enc-3' });
        queue.advance(); // moves Song 2 to back
        assert.equal(queue.currentSong.title, 'Song 3');
    });

    it('inserts TTS audio and signals requiresInterrupt without directly touching player hardware', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Main Song', encoded: 'enc-main', isTTS: false });
        const { requiresInterrupt } = queue.insertTTS({ title: 'TTS Notification', encoded: 'enc-tts', isTTS: true }, player.position);

        assert.equal(requiresInterrupt, true);
        assert.equal(queue.songs[1].title, 'TTS Notification');
        assert.equal(queue.songs[2].title, 'Main Song');
        assert.equal(queue.songs[2].resumePosition, 5000);
    });

    it('shuffles songs keeping index 0 intact', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Track 0', encoded: 'enc-0' });
        for (let i = 1; i <= 20; i++) {
            queue.addTrack({ title: `Track ${i}`, encoded: `enc-${i}` });
        }

        queue.shuffle();
        assert.equal(queue.songs[0].title, 'Track 0');
        assert.equal(queue.size, 21);
    });
});
