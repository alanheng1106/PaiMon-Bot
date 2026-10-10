import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import FilePromptProvider from '../src/core/ai/FilePromptProvider';

describe('FilePromptProvider (Dynamic Date/Time Ingestion)', () => {
    it('replaces {{date}}, {{time}}, and {{datetime}} in prompt template', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'));
        const tempFile = path.join(tempDir, 'test-prompt.txt');
        fs.writeFileSync(tempFile, '今天是 {{date}}，當前時間是 {{time}}，完整時間戳 {{datetime}}。', 'utf8');

        try {
            const provider = new FilePromptProvider(tempFile);
            const mockDate = new Date('2026-09-22T14:30:00');
            const result = provider.getFormattedSystemPrompt(mockDate);

            assert.ok(!result.includes('{{date}}'));
            assert.ok(!result.includes('{{time}}'));
            assert.ok(!result.includes('{{datetime}}'));
            assert.ok(result.includes('2026'));
            assert.ok(result.includes('14:30:00') || result.includes('14:30'));
            assert.ok(result.includes('2026-09-22'));
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('falls back gracefully when prompt template file cannot be loaded', () => {
        const nonExistentFile = path.join(os.tmpdir(), 'non-existent-prompt-' + Date.now() + '.txt');
        const provider = new FilePromptProvider(nonExistentFile);

        const result = provider.getFormattedSystemPrompt();
        assert.ok(result.length > 0);
        assert.ok(!result.includes('{{date}}'));
    });

    it('loads the actual production system-prompt.txt with valid formatting', () => {
        const provider = new FilePromptProvider();
        const formatted = provider.getFormattedSystemPrompt();

        assert.ok(!formatted.includes('{{date}}'));
        assert.ok(!formatted.includes('{{time}}'));
        assert.ok(!formatted.includes('{{datetime}}'));
        assert.ok(formatted.includes('派蒙'));
        assert.ok(formatted.includes('Discord 動態時間戳'));
    });
});
