const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const MusicManager = require('../src/core/MusicManager');

// We only test the pure utility methods — no Lavalink connection needed.
// MusicManager requires a bot instance, so we mock it minimally.
const mockBot = { user: { id: '123' }, settings: { get: () => null } };

describe('MusicManager.formatDuration', () => {
    // formatDuration is an instance method, so we need a minimal instance.
    // We can't fully construct because Shoukaku needs a real client,
    // so we call it via prototype with a dummy `this`.
    const fmt = MusicManager.prototype.formatDuration;

    it('formats seconds correctly', () => {
        assert.equal(fmt(0), '直播流');
        assert.equal(fmt(1000), '0:01');
        assert.equal(fmt(10000), '0:10');
        assert.equal(fmt(60000), '1:00');
        assert.equal(fmt(61000), '1:01');
        assert.equal(fmt(90000), '1:30');
    });

    it('formats minutes correctly', () => {
        assert.equal(fmt(300000), '5:00');      // 5 min
        assert.equal(fmt(599000), '9:59');      // 9:59
        assert.equal(fmt(600000), '10:00');     // 10 min
    });

    it('formats hours correctly', () => {
        assert.equal(fmt(3600000), '1:00:00');  // 1 hour
        assert.equal(fmt(3661000), '1:01:01');  // 1:01:01
        assert.equal(fmt(7200000), '2:00:00');  // 2 hours
        assert.equal(fmt(7261000), '2:01:01');  // 2:01:01
    });

    it('pads seconds with leading zero', () => {
        assert.equal(fmt(5000), '0:05');
        assert.equal(fmt(65000), '1:05');
        assert.equal(fmt(3605000), '1:00:05');
    });
});

describe('MusicManager.createProgressBar', () => {
    const bar = MusicManager.prototype.createProgressBar;

    it('returns a string with time markers', () => {
        const result = bar.call({ formatDuration: MusicManager.prototype.formatDuration }, 30000, 180000, 10);
        assert.ok(result.includes('0:30'), 'Should include current time');
        assert.ok(result.includes('3:00'), 'Should include total time');
        assert.ok(result.includes('🔘'), 'Should include position indicator');
    });

    it('handles 0 progress', () => {
        const result = bar.call({ formatDuration: MusicManager.prototype.formatDuration }, 0, 180000, 10);
        assert.ok(result.includes('直播流') || result.includes('0:00'), 'Should handle 0 current');
    });
});
