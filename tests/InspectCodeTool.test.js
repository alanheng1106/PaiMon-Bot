import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import InspectCodeTool from '../src/core/tools/InspectCodeTool.js';

// ─── Mock LargeFileCache ────────────────────────────────────────────────────
function makeMockCache(overrides = {}) {
    const files = new Map();
    return {
        listFiles(channelId) {
            return [...(files.get(channelId) || [])];
        },
        get(channelId, filename) {
            return files.get(channelId)?.find((f) => f.filename === filename) || null;
        },
        readLines(channelId, filename, start, end) {
            const file = files.get(channelId)?.find((f) => f.filename === filename);
            if (!file) return null;
            const s = Math.max(1, start) - 1;
            const e = Math.min(file.totalLines, end);
            return file.lines.slice(s, e);
        },
        _addFile(channelId, filename, content, language = 'txt') {
            const lines = content.split('\n');
            if (!files.has(channelId)) files.set(channelId, []);
            files.get(channelId).push({
                filename,
                lines,
                totalLines: lines.length,
                totalBytes: Buffer.byteLength(content, 'utf8'),
                language
            });
        },
        ...overrides
    };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('InspectCodeTool', () => {
    // ── definition ───────────────────────────────────────────────────────────
    it('has correct tool name and required schema', () => {
        const tool = new InspectCodeTool();
        const def = tool.definition;
        assert.equal(def.type, 'function');
        assert.equal(def.function.name, 'inspect_code');
        assert.ok(def.function.description.length > 50, 'description should be non-trivial');
        const params = def.function.parameters;
        assert.ok(params.properties.filename);
        assert.ok(params.properties.start_line);
        assert.deepEqual(params.required, ['filename', 'start_line']);
    });

    // ── no cache injected ────────────────────────────────────────────────────
    it('returns error when largeFileCache is not in context', async () => {
        const tool = new InspectCodeTool();
        const result = await tool.execute({ filename: 'main.asm', start_line: 1 }, {});
        assert.ok(result.includes('錯誤'), 'should report error when cache is missing');
        assert.ok(result.includes('largeFileCache'), 'error should mention largeFileCache');
    });

    it('returns error when channelId is not in context', async () => {
        const tool = new InspectCodeTool();
        const result = await tool.execute({ filename: 'main.asm', start_line: 1 }, { largeFileCache: makeMockCache() });
        assert.ok(result.includes('錯誤'), 'should report error when channelId is missing');
    });

    // ── list files (empty) ───────────────────────────────────────────────────
    it('lists "no files" when filename is "?" and cache is empty', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const result = await tool.execute(
            { filename: '?', start_line: 1 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('沒有'), 'should report no files');
    });

    // ── list files (with entries) ────────────────────────────────────────────
    it('lists available files when filename is "?"', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        cache._addFile('ch1', 'main.asm', Array.from({ length: 50 }, (_, i) => `LINE_${i}`).join('\n'), 'asm');
        const result = await tool.execute(
            { filename: '?', start_line: 1 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('main.asm'), 'should include filename in listing');
    });

    // ── file not found ───────────────────────────────────────────────────────
    it('returns error when requested file is not in cache', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const result = await tool.execute(
            { filename: 'ghost.asm', start_line: 1 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('錯誤') || result.includes('找不到'), 'should report file not found');
        assert.ok(result.includes('ghost.asm'), 'error should mention the filename');
    });

    // ── normal read ──────────────────────────────────────────────────────────
    it('reads correct line range with line numbers', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const content = Array.from({ length: 20 }, (_, i) => `LINE_${i + 1}`).join('\n');
        cache._addFile('ch1', 'main.asm', content, 'asm');

        const result = await tool.execute(
            { filename: 'main.asm', start_line: 3, end_line: 5 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('LINE_3'), 'should include LINE_3');
        assert.ok(result.includes('LINE_4'), 'should include LINE_4');
        assert.ok(result.includes('LINE_5'), 'should include LINE_5');
        assert.ok(!result.includes('LINE_6'), 'should not include LINE_6');
        // Should have line numbers prefixed
        assert.ok(result.includes('|'), 'output should include | separating line number from content');
    });

    // ── auto-extend end_line when omitted ────────────────────────────────────
    it('reads up to MAX_LINES_PER_CALL when end_line is omitted', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        // Create a 300-line file
        const content = Array.from({ length: 300 }, (_, i) => `LINE_${i + 1}`).join('\n');
        cache._addFile('ch1', 'big.asm', content, 'asm');

        const result = await tool.execute(
            { filename: 'big.asm', start_line: 1 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        // Should include LINE_1 to LINE_200 (max 200) but not LINE_201
        assert.ok(result.includes('LINE_1'));
        assert.ok(result.includes('LINE_200'));
        assert.ok(!result.includes('LINE_201'), 'should cap at 200 lines');
    });

    // ── MAX_LINES_PER_CALL cap ────────────────────────────────────────────────
    it('caps output at 200 lines even when a larger range is requested', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const content = Array.from({ length: 500 }, (_, i) => `LINE_${i + 1}`).join('\n');
        cache._addFile('ch1', 'big.asm', content, 'asm');

        const result = await tool.execute(
            { filename: 'big.asm', start_line: 1, end_line: 500 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(!result.includes('LINE_201'), 'should cap at LINE_200 when end exceeds limit');
        assert.ok(result.includes('LINE_200'));
    });

    // ── truncation notice ────────────────────────────────────────────────────
    it('includes continue-reading notice when output was capped', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const content = Array.from({ length: 500 }, (_, i) => `LINE_${i + 1}`).join('\n');
        cache._addFile('ch1', 'big.asm', content, 'asm');

        const result = await tool.execute(
            { filename: 'big.asm', start_line: 1, end_line: 500 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('inspect_code'), 'truncation notice should remind user to call inspect_code again');
    });

    // ── invalid start_line ───────────────────────────────────────────────────
    it('returns error for invalid start_line', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        cache._addFile('ch1', 'main.asm', 'line1\nline2\n', 'asm');
        const result = await tool.execute(
            { filename: 'main.asm', start_line: -10 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        // -10 is invalid so it should return an error
        assert.ok(result.includes('錯誤') || result.includes('line1'), 'should handle invalid start_line');
    });

    // ── file header info ─────────────────────────────────────────────────────
    it('output contains file name and total line info in header', async () => {
        const tool = new InspectCodeTool();
        const cache = makeMockCache();
        const content = Array.from({ length: 10 }, (_, i) => `LINE_${i + 1}`).join('\n');
        cache._addFile('ch1', 'main.asm', content, 'asm');

        const result = await tool.execute(
            { filename: 'main.asm', start_line: 1, end_line: 5 },
            { largeFileCache: cache, channelId: 'ch1' }
        );
        assert.ok(result.includes('main.asm'), 'header should contain filename');
        assert.ok(result.includes('10'), 'header should show total line count');
    });
});
