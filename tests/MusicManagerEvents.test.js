import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import MusicManager from '../src/core/MusicManager';
import GuildQueue from '../src/core/music/GuildQueue';

describe('MusicManager Event Handlers & Lifecycle', () => {
    class MockPlayer extends EventEmitter {
        constructor() {
            super();
            this.position = 0;
            this.paused = false;
            this.stopped = false;
            this.playedTracks = [];
        }
        async playTrack(options) {
            this.playedTracks.push(options);
            return true;
        }
        stopTrack() {
            this.stopped = true;
        }
        setGlobalVolume() {}
    }

    const createSetup = () => {
        const player = new MockPlayer();
        const mockShoukaku = {
            joinVoiceChannel: async () => player,
            leaveVoiceChannel: () => {}
        };
        const manager = new MusicManager({ shoukaku: mockShoukaku });
        const mockGuild = { id: 'guild-event-1', shardId: 0 };
        const mockTextChannel = {
            send: async () => {}
        };
        return { manager, player, mockGuild, mockTextChannel };
    };

    it('does not advance queue on exception, and advances exactly once when subsequent end(loadFailed) arrives', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Broken Song 1', uri: 'http://a', duration: 10000 }, encoded: 'enc1' },
            { id: 'user-1' }
        );
        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Good Song 2', uri: 'http://b', duration: 20000 }, encoded: 'enc2' },
            { id: 'user-1' }
        );

        const queue = manager.getQueue('guild-event-1');
        assert.equal(queue.size, 2);
        assert.equal(queue.currentSong.title, 'Broken Song 1');

        // 1. Lavalink emits 'exception'
        player.emit('exception', { exception: { message: 'Java audio track decode error' } });

        // Assert: Queue must NOT have advanced yet
        assert.equal(queue.currentSong.title, 'Broken Song 1', 'Queue must NOT advance upon exception event');
        assert.equal(queue.size, 2);

        // 2. Lavalink subsequently emits 'end' with reason 'loadFailed'
        player.emit('end', { reason: 'loadFailed' });

        // Assert: Queue advances exactly once to Song 2
        assert.equal(queue.currentSong.title, 'Good Song 2', 'Queue must advance to Song 2 upon end(loadFailed)');
        assert.equal(queue.size, 1);
    });

    it('advances queue normally on end event with reason finished', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song A', uri: 'http://a', duration: 10000 }, encoded: 'encA' },
            { id: 'user-1' }
        );
        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song B', uri: 'http://b', duration: 20000 }, encoded: 'encB' },
            { id: 'user-1' }
        );

        const queue = manager.getQueue('guild-event-1');
        assert.equal(queue.currentSong.title, 'Song A');

        player.emit('end', { reason: 'finished' });
        assert.equal(queue.currentSong.title, 'Song B');
    });

    it('does not advance queue on end event with reason replaced or cleanup', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song A', uri: 'http://a', duration: 10000 }, encoded: 'encA' },
            { id: 'user-1' }
        );
        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song B', uri: 'http://b', duration: 20000 }, encoded: 'encB' },
            { id: 'user-1' }
        );

        const queue = manager.getQueue('guild-event-1');

        player.emit('end', { reason: 'replaced' });
        assert.equal(queue.currentSong.title, 'Song A', 'replaced reason must not advance queue');

        player.emit('end', { reason: 'cleanup' });
        assert.equal(queue.currentSong.title, 'Song A', 'cleanup reason must not advance queue');
    });

    it('advances queue on end(stopped) during skip, but does not advance during stop()', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song 1', uri: 'http://1', duration: 10000 }, encoded: 'enc1' },
            { id: 'user-1' }
        );
        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song 2', uri: 'http://2', duration: 20000 }, encoded: 'enc2' },
            { id: 'user-1' }
        );

        const queue = manager.getQueue('guild-event-1');

        // Test Skip path: player.stopTrack() called while isStopped = false
        manager.skip('guild-event-1');
        assert.equal(player.stopped, true);

        // When Lavalink fires end with stopped, it advances to Song 2
        player.emit('end', { reason: 'stopped' });
        assert.equal(queue.currentSong.title, 'Song 2');

        // Test Stop path: manager.stop() sets isStopped = true and clears
        manager.stop('guild-event-1');
        assert.equal(queue.isStopped, true);
        assert.equal(queue.isEmpty(), true);

        // When Lavalink fires end with stopped, next() returns cleanly without processing
        player.emit('end', { reason: 'stopped' });
        assert.equal(queue.isEmpty(), true);
    });

    it('calls player.stopTrack() when stuck event is emitted', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Stuck Song', uri: 'http://s', duration: 10000 }, encoded: 'encS' },
            { id: 'user-1' }
        );

        assert.equal(player.stopped, false);
        player.emit('stuck', { thresholdMs: 10000 });
        assert.equal(player.stopped, true, 'player.stopTrack() must be called on stuck');
    });

    it('completely destroys queue and clears nowPlaying timer on closed event', async () => {
        const { manager, player, mockGuild, mockTextChannel } = createSetup();

        await manager.play(
            { guild: mockGuild, id: 'vc-1' },
            mockTextChannel,
            { info: { title: 'Song X', uri: 'http://x', duration: 10000 }, encoded: 'encX' },
            { id: 'user-1' }
        );

        const queue = manager.getQueue('guild-event-1');
        let timerCleared = false;
        queue.setNowPlayingTimer({
            id: 'mock-timer'
        });
        queue.clearNowPlayingTimer = () => {
            timerCleared = true;
        };

        player.emit('closed');

        assert.equal(manager.getQueue('guild-event-1'), null, 'Queue must be removed from manager on closed');
        assert.equal(timerCleared, true, 'nowPlayingTimer must be cleared on closed');
    });

    it('GuildQueue.destroy() resets songs, loop mode, and clears nowPlaying timer cleanly', () => {
        const player = new MockPlayer();
        const queue = new GuildQueue(player, {}, 'vc-1');

        queue.addTrack({ title: 'Song 1', encoded: 'e1', duration: 1000 });
        queue.setLoopMode('track');
        let timerCleared = false;
        queue.setNowPlayingTimer({ id: 't' }, () => {});
        queue.clearNowPlayingTimer = () => {
            timerCleared = true;
        };

        queue.destroy();

        assert.equal(queue.isEmpty(), true);
        assert.equal(queue.loopMode, 'none');
        assert.equal(queue.isStopped, true);
        assert.equal(timerCleared, true);
    });
});
