import { describe, it } from 'node:test';
import assert from 'node:assert';
import ColorUtils from '../src/utils/ColorUtils';

describe('ColorUtils (Centralized Color Utilities)', () => {
    describe('hexToInt', () => {
        it('parses prefixed hex string to integer', () => {
            assert.strictEqual(ColorUtils.hexToInt('#5865F2'), 0x5865f2);
        });

        it('parses un-prefixed hex string to integer', () => {
            assert.strictEqual(ColorUtils.hexToInt('FF0000'), 0xff0000);
        });

        it('returns raw number directly when input is already an integer', () => {
            assert.strictEqual(ColorUtils.hexToInt(0x5865f2), 0x5865f2);
            assert.strictEqual(ColorUtils.hexToInt(0, 0x123456), 0);
        });

        it('returns fallback for invalid input', () => {
            assert.strictEqual(ColorUtils.hexToInt('invalid', 0x123456), 0x123456);
            assert.strictEqual(ColorUtils.hexToInt(null, 0x123456), 0x123456);
            assert.strictEqual(ColorUtils.hexToInt(undefined, 0x123456), 0x123456);
            assert.strictEqual(ColorUtils.hexToInt(NaN, 0x123456), 0x123456);
        });
    });
});
