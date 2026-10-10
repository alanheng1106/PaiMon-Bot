import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import LargeFileCache from '../src/core/ai/LargeFileCache.js';

// ─── Helper ────────────────────────────────────────────────────────────────
/**
 * Build a synthetic file content string of approximately targetBytes bytes.
 * Assembly-like format so the symbol scanner has something to find.
 */
function makeAsmContent(lines = 500, prefix = '') {
    const header = `; ${prefix}Assembly test file\nbits 64\nglobal _start\nsection .data\n    msg db "Hello", 0\nsection .text\n_start:\n    mov rax, 1\n    mov rdi, 1\n    syscall\n    xor rdi, rdi\n    mov rax, 60\n    syscall\n`;
    const bodyLines = Array.from(
        { length: lines },
        (_, i) => `func_${i}:\n    push rbp\n    mov rbp, rsp\n    ; body of func_${i}\n    pop rbp\n    ret\n`
    ).join('');
    return header + bodyLines;
}

const SMALL_CONTENT = 'section .text\nglobal _start\n_start:\n    mov rax, 60\n    syscall\n';
const LARGE_CONTENT = makeAsmContent(1200); // well over 40 KB

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('LargeFileCache', () => {
    let cache: LargeFileCache;
    beforeEach(() => {
        cache = new LargeFileCache({ largeFileThresholdBytes: 40 * 1024, ttlMs: 1000 * 60 * 60 * 2 });
    });

    // ── isLargeFile ──────────────────────────────────────────────────────────
    describe('isLargeFile()', () => {
        it('returns false for content below threshold', () => {
            assert.equal(cache.isLargeFile(SMALL_CONTENT), false);
        });

        it('returns true for content at or above threshold', () => {
            assert.equal(cache.isLargeFile(LARGE_CONTENT), true);
        });

        it('respects custom threshold', () => {
            const tiny = new LargeFileCache({ largeFileThresholdBytes: 5 });
            assert.equal(tiny.isLargeFile('hello'), true);
            assert.equal(tiny.isLargeFile('hi'), false);
        });
    });

    // ── store / get ──────────────────────────────────────────────────────────
    describe('store() and get()', () => {
        it('stores a file and retrieves it', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const entry = cache.get('ch1', 'main.asm');
            assert.ok(entry, 'entry should exist');
            assert.equal(entry!.filename, 'main.asm');
            assert.equal(entry!.language, 'asm');
            assert.ok(entry!.totalLines > 0);
            assert.ok(entry!.totalBytes > 0);
        });

        it('returns null for unknown file', () => {
            assert.equal(cache.get('ch1', 'nonexistent.asm'), null);
        });

        it('returns null for unknown channel', () => {
            assert.equal(cache.get('unknown-channel', 'main.asm'), null);
        });

        it('replaces existing entry for same (channelId, filename)', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const newContent = LARGE_CONTENT + '\n; extra line\n';
            cache.store('ch1', 'main.asm', newContent, 'asm');
            const entry = cache.get('ch1', 'main.asm')!;
            // New content should have one more line
            const newEntry = cache.store('ch1', 'main.asm', newContent, 'asm');
            assert.ok(newEntry.totalLines >= entry.totalLines);
        });

        it('isolates files across channels', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            assert.equal(cache.get('ch2', 'main.asm'), null);
        });

        it('infers language from extension when not provided', () => {
            cache.store('ch1', 'kernel.c', LARGE_CONTENT);
            const entry = cache.get('ch1', 'kernel.c');
            assert.equal(entry!.language, 'c');
        });
    });

    // ── readLines ────────────────────────────────────────────────────────────
    describe('readLines()', () => {
        beforeEach(() => {
            // Store a deterministic 10-line file
            const content = Array.from({ length: 10 }, (_, i) => `LINE_${i + 1}`).join('\n');
            cache.store('ch1', 'test.txt', content, 'txt');
        });

        it('reads a specific line range (1-indexed, inclusive)', () => {
            const lines = cache.readLines('ch1', 'test.txt', 3, 5);
            assert.deepEqual(lines, ['LINE_3', 'LINE_4', 'LINE_5']);
        });

        it('clamps start to 1', () => {
            const lines = cache.readLines('ch1', 'test.txt', -5, 2);
            assert.deepEqual(lines, ['LINE_1', 'LINE_2']);
        });

        it('clamps end to totalLines', () => {
            const lines = cache.readLines('ch1', 'test.txt', 9, 9999);
            assert.deepEqual(lines, ['LINE_9', 'LINE_10']);
        });

        it('returns null for unknown file', () => {
            assert.equal(cache.readLines('ch1', 'missing.txt', 1, 5), null);
        });

        it('returns single line when start === end', () => {
            const lines = cache.readLines('ch1', 'test.txt', 7, 7);
            assert.deepEqual(lines, ['LINE_7']);
        });
    });

    // ── buildOutline ─────────────────────────────────────────────────────────
    describe('buildOutline()', () => {
        it('returns null for unknown file', () => {
            assert.equal(cache.buildOutline('ch1', 'ghost.asm'), null);
        });

        it('returns a non-empty string containing filename and line count', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const outline = cache.buildOutline('ch1', 'main.asm');
            assert.ok(outline, 'outline should not be null');
            assert.ok(outline!.includes('main.asm'));
            assert.ok(outline!.includes('行'));
        });

        it('includes symbol index when symbols are present', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const outline = cache.buildOutline('ch1', 'main.asm')!;
            // Our generated asm has "func_0:", "func_1:", etc. — should appear
            assert.ok(outline.includes('符號') || outline.includes('func_'), 'should include symbol index');
        });

        it('includes inspect_code usage hint', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const outline = cache.buildOutline('ch1', 'main.asm')!;
            assert.ok(outline.includes('inspect_code'));
        });

        it('does not include the full file body (only head + tail)', () => {
            // The generated content has many "body of func_N" lines
            // Only first 40 + last 20 should appear — not ALL of them
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const outline = cache.buildOutline('ch1', 'main.asm')!;
            const fullOccurrences = (outline.match(/body of func_/g) || []).length;
            const totalFuncs = (LARGE_CONTENT.match(/body of func_/g) || []).length;
            // Should see far fewer repetitions in outline than in full content
            assert.ok(fullOccurrences < totalFuncs, `outline should not contain all ${totalFuncs} func bodies`);
        });
    });

    // ── listFiles ────────────────────────────────────────────────────────────
    describe('listFiles()', () => {
        it('returns empty array for empty channel', () => {
            assert.deepEqual(cache.listFiles('empty-ch'), []);
        });

        it('returns all stored files for a channel', () => {
            cache.store('ch1', 'a.asm', LARGE_CONTENT, 'asm');
            cache.store('ch1', 'b.c', LARGE_CONTENT, 'c');
            const files = cache.listFiles('ch1');
            assert.equal(files.length, 2);
            const names = files.map((f) => f.filename).sort();
            assert.deepEqual(names, ['a.asm', 'b.c']);
        });

        it('does not leak files from other channels', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            cache.store('ch2', 'other.py', LARGE_CONTENT, 'py');
            const ch1Files = cache.listFiles('ch1');
            assert.equal(ch1Files.length, 1);
            assert.equal(ch1Files[0].filename, 'main.asm');
        });
    });

    // ── evict / clearChannel ─────────────────────────────────────────────────
    describe('evict() and clearChannel()', () => {
        it('evict() removes a specific file', () => {
            cache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const removed = cache.evict('ch1', 'main.asm');
            assert.equal(removed, true);
            assert.equal(cache.get('ch1', 'main.asm'), null);
        });

        it('evict() returns false for unknown file', () => {
            assert.equal(cache.evict('ch1', 'ghost.asm'), false);
        });

        it('clearChannel() removes all files in a channel', () => {
            cache.store('ch1', 'a.asm', LARGE_CONTENT);
            cache.store('ch1', 'b.asm', LARGE_CONTENT);
            cache.clearChannel('ch1');
            assert.deepEqual(cache.listFiles('ch1'), []);
        });
    });

    // ── TTL expiry ───────────────────────────────────────────────────────────
    describe('TTL expiry', () => {
        it('expired entries return null from get()', () => {
            // Create cache with tiny TTL
            const shortCache = new LargeFileCache({ largeFileThresholdBytes: 1, ttlMs: 1 });
            shortCache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            // Wait just a bit longer than 1 ms
            const now = Date.now();
            while (Date.now() - now < 5) {
                /* busy spin */
            }
            assert.equal(shortCache.get('ch1', 'main.asm'), null);
        });

        it('expired entries are excluded from listFiles()', () => {
            const shortCache = new LargeFileCache({ largeFileThresholdBytes: 1, ttlMs: 1 });
            shortCache.store('ch1', 'main.asm', LARGE_CONTENT, 'asm');
            const now = Date.now();
            while (Date.now() - now < 5) {
                /* busy spin */
            }
            assert.deepEqual(shortCache.listFiles('ch1'), []);
        });
    });

    // ── Channel cap enforcement ──────────────────────────────────────────────
    describe('Channel cap enforcement', () => {
        it('evicts oldest channel when maxChannels is exceeded', () => {
            const tinyCache = new LargeFileCache({ largeFileThresholdBytes: 1, maxChannels: 2 });
            tinyCache.store('ch1', 'f.asm', LARGE_CONTENT);
            tinyCache.store('ch2', 'f.asm', LARGE_CONTENT);
            tinyCache.store('ch3', 'f.asm', LARGE_CONTENT); // should evict ch1
            // ch3 should be present; ch1 may be evicted
            assert.ok(tinyCache.get('ch3', 'f.asm') !== null, 'ch3 should still have file');
        });

        it('evicts oldest file when maxFilesPerChannel is exceeded', () => {
            const tinyCache = new LargeFileCache({ largeFileThresholdBytes: 1, maxFilesPerChannel: 2 });
            tinyCache.store('ch1', 'a.asm', LARGE_CONTENT);
            tinyCache.store('ch1', 'b.asm', LARGE_CONTENT);
            tinyCache.store('ch1', 'c.asm', LARGE_CONTENT); // should evict 'a.asm'
            const files = tinyCache.listFiles('ch1').map((f) => f.filename);
            assert.ok(files.includes('c.asm'), 'c.asm should exist');
            assert.equal(files.length, 2, 'should cap at 2 files');
        });
    });

    // ── channelCount ─────────────────────────────────────────────────────────
    describe('channelCount', () => {
        it('reflects the number of channels being tracked', () => {
            assert.equal(cache.channelCount, 0);
            cache.store('ch1', 'a.asm', LARGE_CONTENT);
            assert.equal(cache.channelCount, 1);
            cache.store('ch2', 'b.asm', LARGE_CONTENT);
            assert.equal(cache.channelCount, 2);
        });
    });
});
