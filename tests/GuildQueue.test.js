'use strict';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import GuildQueue from '../src/core/music/GuildQueue';
import Song from '../src/core/music/Song';

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
        const { requiresInterrupt } = queue.insertTTS(
            { title: 'TTS Notification', encoded: 'enc-tts', isTTS: true },
            player.position
        );

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

    it('manages nowPlayingTimer lifecycle and clears timer on advance, shift, and clear', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        let clearedCount = 0;
        const mockTimer = {
            id: 123
        };
        // Mock global.clearInterval to track cleanup
        const originalClearInterval = global.clearInterval;
        global.clearInterval = (t) => {
            if (t === mockTimer) clearedCount++;
            else originalClearInterval(t);
        };

        try {
            // Set timer
            queue.setNowPlayingTimer(mockTimer);
            assert.equal(queue.nowPlayingTimer, mockTimer);

            // Re-setting should clear prior timer
            const mockTimer2 = { id: 456 };
            queue.setNowPlayingTimer(mockTimer2);
            assert.equal(clearedCount, 1);
            assert.equal(queue.nowPlayingTimer, mockTimer2);

            // clearNowPlayingTimer explicitly
            queue.clearNowPlayingTimer();
            assert.equal(queue.nowPlayingTimer, null);

            // Setting on advance()
            queue.addTrack({ title: 'Song 1', encoded: '1' });
            queue.addTrack({ title: 'Song 2', encoded: '2' });
            const mockTimer3 = { id: 789 };
            queue.setNowPlayingTimer(mockTimer3);
            queue.advance();
            assert.equal(queue.nowPlayingTimer, null);

            // Setting on shift()
            const mockTimer4 = { id: 101 };
            queue.setNowPlayingTimer(mockTimer4);
            queue.shift();
            assert.equal(queue.nowPlayingTimer, null);

            // Setting on clear()
            const mockTimer5 = { id: 202 };
            queue.setNowPlayingTimer(mockTimer5);
            queue.clear();
            assert.equal(queue.nowPlayingTimer, null);

            // Finalizer invoked on advance()
            queue.addTrack({ title: 'Song 3', encoded: '3' });
            let finalizerCalled = false;
            queue.setNowPlayingTimer({ id: 303 }, () => {
                finalizerCalled = true;
            });
            queue.advance();
            assert.equal(finalizerCalled, true);
            assert.equal(queue.nowPlayingTimer, null);
        } finally {
            global.clearInterval = originalClearInterval;
        }
    });

    it('preserves nowPlayingTimer and does NOT finalize when interrupted by TTS and when TTS finishes', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song A', encoded: 'enc-a', duration: 180000 });

        let finalizerCalled = false;
        const mockTimer = { id: 999 };
        queue.setNowPlayingTimer(mockTimer, () => {
            finalizerCalled = true;
        });

        // 1. User runs /tts: insertTTS is invoked while Song A is playing at position 45000
        const { requiresInterrupt } = queue.insertTTS(
            { title: 'TTS Voice Message', encoded: 'enc-tts', isTTS: true },
            45000
        );
        assert.equal(requiresInterrupt, true);
        assert.equal(queue.isInterruptedForTTS, true);
        assert.equal(queue.songs.length, 3);
        assert.equal(queue.songs[0].title, 'Song A');
        assert.equal(queue.songs[1].title, 'TTS Voice Message');
        assert.equal(queue.songs[2].title, 'Song A');
        assert.equal(queue.songs[2].resumePosition, 45000);

        // 2. Player stops track to switch to TTS -> advance() is called
        const ttsTrack = queue.advance();
        assert.equal(finalizerCalled, false, 'Finalizer must NOT be called when interrupted for TTS');
        assert.equal(queue.nowPlayingTimer, mockTimer, 'Timer must NOT be cleared during TTS interruption');
        assert.equal(ttsTrack.title, 'TTS Voice Message');
        assert.equal(queue.currentSong.title, 'TTS Voice Message');

        // 3. TTS broadcast ends -> advance() is called again
        const resumedTrack = queue.advance();
        assert.equal(finalizerCalled, false, 'Finalizer must NOT be called when TTS ends');
        assert.equal(queue.nowPlayingTimer, mockTimer, 'Timer must NOT be cleared when TTS ends');
        assert.equal(resumedTrack.title, 'Song A');
        assert.equal(resumedTrack.resumePosition, 45000);
        assert.equal(queue.currentSong.title, 'Song A');

        // 4. Resumed Song A actually reaches the end -> advance() is called
        const ended = queue.advance();
        assert.equal(finalizerCalled, true, 'Finalizer must be called when the resumed track actually ends');
        assert.equal(queue.nowPlayingTimer, null, 'Timer must be cleared when the song actually finishes');
        assert.equal(ended, null);
    });

    it('prevents duplicate resume tracks when multiple TTS are queued during interruption', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song A', encoded: 'enc-a', duration: 180000 });

        // First TTS
        const res1 = queue.insertTTS({ title: 'TTS 1', encoded: 'tts-1', isTTS: true }, 10000);
        assert.equal(res1.requiresInterrupt, true);

        // Second TTS arrives before first advance
        const res2 = queue.insertTTS({ title: 'TTS 2', encoded: 'tts-2', isTTS: true }, 10000);
        assert.equal(res2.requiresInterrupt, false);

        // Queue order should be: Song A, TTS 1, TTS 2, Song A (resume)
        assert.equal(queue.songs.length, 4);
        assert.equal(queue.songs[0].title, 'Song A');
        assert.equal(queue.songs[1].title, 'TTS 1');
        assert.equal(queue.songs[2].title, 'TTS 2');
        assert.equal(queue.songs[3].title, 'Song A');

        // Advance past interrupted Song A
        queue.advance();
        assert.equal(queue.currentSong.title, 'TTS 1');

        // Advance past TTS 1
        queue.advance();
        assert.equal(queue.currentSong.title, 'TTS 2');

        // Advance past TTS 2
        queue.advance();
        assert.equal(queue.currentSong.title, 'Song A');
        assert.equal(queue.currentSong.resumePosition, 10000);
    });

    it('correctly shifts track during TTS interruption even with loopMode track or queue', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song Loop', encoded: 'enc-loop' });
        queue.setLoopMode('track');

        queue.insertTTS({ title: 'TTS Alert', encoded: 'enc-tts', isTTS: true }, 20000);
        // Interruption advance must switch to TTS, not re-loop index 0
        const track1 = queue.advance();
        assert.equal(track1.title, 'TTS Alert');

        // TTS finish advance must switch to resume song, not loop TTS
        const track2 = queue.advance();
        assert.equal(track2.title, 'Song Loop');
        assert.equal(track2.resumePosition, 20000);
    });

    it('tracks isStopped state and resets on addTrack', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        assert.equal(queue.isStopped, false);
        queue.isStopped = true;
        assert.equal(queue.isStopped, true);

        queue.addTrack({ title: 'Song 1', encoded: '1' });
        assert.equal(queue.isStopped, false);
    });
});
