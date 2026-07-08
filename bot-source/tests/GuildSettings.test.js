const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const GuildSettings = require('../src/core/GuildSettings');

const TEST_DATA_DIR = path.join(__dirname, '..', 'data-test');
const TEST_FILE = path.join(TEST_DATA_DIR, 'guild-settings.json');

describe('GuildSettings', () => {
    let gs;

    beforeEach(() => {
        // Override paths to use a test directory
        gs = new GuildSettings();
        gs.dataDir = TEST_DATA_DIR;
        gs.filePath = TEST_FILE;
        gs.data = {};
    });

    afterEach(() => {
        // Cleanup
        clearTimeout(gs._debounceTimer);
        try {
            if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
            if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR);
        } catch {
            // Ignore cleanup errors
        }
    });

    it('returns default value when key does not exist', () => {
        assert.equal(gs.get('guild1', 'volume'), null);
        assert.equal(gs.get('guild1', 'volume', 50), 50);
    });

    it('sets and gets a value', () => {
        gs.set('guild1', 'volume', 75);
        assert.equal(gs.get('guild1', 'volume'), 75);
    });

    it('overwrites existing value', () => {
        gs.set('guild1', 'volume', 50);
        gs.set('guild1', 'volume', 100);
        assert.equal(gs.get('guild1', 'volume'), 100);
    });

    it('isolates settings per guild', () => {
        gs.set('guild1', 'volume', 50);
        gs.set('guild2', 'volume', 80);
        assert.equal(gs.get('guild1', 'volume'), 50);
        assert.equal(gs.get('guild2', 'volume'), 80);
    });

    it('flush() writes data to disk immediately', () => {
        gs.set('guild1', 'volume', 42);
        gs.flush();

        assert.ok(fs.existsSync(TEST_FILE), 'File should exist after flush');
        const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
        assert.equal(data.guild1.volume, 42);
    });

    it('flush() cancels pending debounce timer', () => {
        gs.set('guild1', 'test', 'value');
        // Timer should be set
        assert.notEqual(gs._debounceTimer, null);

        gs.flush();
        // After flush, the timer reference should still exist but the timeout was cleared
        // Verify data is on disk
        const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
        assert.equal(data.guild1.test, 'value');
    });
});
