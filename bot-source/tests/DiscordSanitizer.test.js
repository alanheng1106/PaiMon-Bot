const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DiscordSanitizer = require('../src/utils/DiscordSanitizer');

describe('DiscordSanitizer (Defense in Depth Sanitization)', () => {
    it('prevents mass pings for @everyone and @here', () => {
        const input = 'Hello @everyone and @here!';
        const output = DiscordSanitizer.sanitize(input);
        assert.ok(!output.includes('@everyone'));
        assert.ok(!output.includes('@here'));
        assert.ok(output.includes('@\u200beveryone'));
        assert.ok(output.includes('@\u200bhere'));
    });

    it('strips LaTeX environment tags and converts math symbols to Unicode', () => {
        const latexInput = '\\begin{aligned} R &= {(w,2)}\\subseteq A\\times B \\end{aligned} \\boxed{S\\circ R}';
        const output = DiscordSanitizer.sanitize(latexInput);
        assert.ok(!output.includes('\\begin{aligned}'));
        assert.ok(!output.includes('\\end{aligned}'));
        assert.ok(!output.includes('\\boxed'));
        assert.ok(output.includes('⊆'));
        assert.ok(output.includes('×'));
        assert.ok(output.includes('∘'));
    });

    it('wraps unrendered Markdown tables into monospaced codeblocks', () => {
        const tableInput = '| Header 1 | Header 2 |\n|---|---|\n| Val 1 | Val 2 |';
        const output = DiscordSanitizer.sanitize(tableInput);
        assert.ok(output.includes('```'));
        assert.ok(output.includes('| Header 1 | Header 2 |'));
    });
});
