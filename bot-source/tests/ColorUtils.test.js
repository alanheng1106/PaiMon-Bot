const { describe, it } = require('node:test');
const assert = require('node:assert');
const ColorUtils = require('../src/utils/ColorUtils');

describe('ColorUtils (Centralized Color Utilities)', () => {
    describe('adjustColor', () => {
        it('returns unmodified hex when amount is 0', () => {
            assert.strictEqual(ColorUtils.adjustColor('#102030', 0), '#102030');
            assert.strictEqual(ColorUtils.adjustColor('102030', 0), '102030');
        });

        it('lightens hex color correctly', () => {
            assert.strictEqual(ColorUtils.adjustColor('#101010', 16), '#202020');
        });

        it('darkens hex color correctly', () => {
            assert.strictEqual(ColorUtils.adjustColor('#202020', -16), '#101010');
        });

        it('clamps RGB values between 0 and 255', () => {
            assert.strictEqual(ColorUtils.adjustColor('#ffffff', 50), '#ffffff');
            assert.strictEqual(ColorUtils.adjustColor('#000000', -50), '#000000');
        });

        it('handles fallback for invalid inputs', () => {
            assert.strictEqual(ColorUtils.adjustColor('invalid', 10), '888888');
            assert.strictEqual(ColorUtils.adjustColor(null, 10), '#888888');
        });
    });

    describe('hexToInt', () => {
        it('parses prefixed hex string to integer', () => {
            assert.strictEqual(ColorUtils.hexToInt('#5865F2'), 0x5865F2);
        });

        it('parses un-prefixed hex string to integer', () => {
            assert.strictEqual(ColorUtils.hexToInt('FF0000'), 0xFF0000);
        });

        it('returns fallback for invalid input', () => {
            assert.strictEqual(ColorUtils.hexToInt('invalid', 0x123456), 0x123456);
            assert.strictEqual(ColorUtils.hexToInt(null, 0x123456), 0x123456);
        });
    });

    describe('normalizeHex', () => {
        it('ensures # prefix on hex string', () => {
            assert.strictEqual(ColorUtils.normalizeHex('5865F2'), '#5865F2');
            assert.strictEqual(ColorUtils.normalizeHex('#5865F2'), '#5865F2');
        });

        it('returns fallback for invalid input', () => {
            assert.strictEqual(ColorUtils.normalizeHex(null, '#000000'), '#000000');
        });
    });
});
