const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const StoreCanvas = require('../src/core/StoreCanvas');

describe('StoreCanvas.adjustColor', () => {
    it('returns the same color when amount is 0', () => {
        assert.equal(StoreCanvas.adjustColor('#ff0000', 0), '#ff0000');
        assert.equal(StoreCanvas.adjustColor('#00ff00', 0), '#00ff00');
        assert.equal(StoreCanvas.adjustColor('#0000ff', 0), '#0000ff');
    });

    it('lightens colors correctly', () => {
        // #800000 + 16 → R=128+16=144=0x90, G=0+16=16=0x10, B=0+16=16=0x10
        assert.equal(StoreCanvas.adjustColor('#800000', 16), '#901010');
    });

    it('darkens colors correctly', () => {
        // #ffffff - 16 → R=255-16=239=0xef, G=255-16=239=0xef, B=255-16=239=0xef
        assert.equal(StoreCanvas.adjustColor('#ffffff', -16), '#efefef');
    });

    it('clamps at 255 (no overflow)', () => {
        // #ff0000 + 100 → R=255 (clamped), G=100, B=100
        assert.equal(StoreCanvas.adjustColor('#ff0000', 100), '#ff6464');
    });

    it('clamps at 0 (no underflow)', () => {
        // #100000 - 100 → R=16-100=0 (clamped), G=0 (clamped), B=0 (clamped)
        assert.equal(StoreCanvas.adjustColor('#100000', -100), '#000000');
    });

    it('handles input without # prefix', () => {
        const result = StoreCanvas.adjustColor('ff0000', 0);
        assert.equal(result, 'ff0000');
    });

    it('preserves correct RGB channel order', () => {
        // This is the bug we fixed: R and G were swapped in the output.
        // #ff0000 (pure red) darkened by 40 should still be red-ish, not green-ish.
        const darkRed = StoreCanvas.adjustColor('#ff0000', -40);
        // Expected: R=215=0xd7, G=0, B=0 → #d70000
        assert.equal(darkRed, '#d70000');

        // #00ff00 (pure green) darkened by 40 should still be green-ish, not red-ish.
        const darkGreen = StoreCanvas.adjustColor('#00ff00', -40);
        // Expected: R=0, G=215=0xd7, B=0 → #00d700
        assert.equal(darkGreen, '#00d700');

        // #0000ff (pure blue) should stay blue
        const darkBlue = StoreCanvas.adjustColor('#0000ff', -40);
        // Expected: R=0, G=0, B=215=0xd7 → #0000d7
        assert.equal(darkBlue, '#0000d7');
    });

    it('returns fallback for invalid hex input', () => {
        assert.equal(StoreCanvas.adjustColor('#gggggg', 0), '#888888');
        assert.equal(StoreCanvas.adjustColor('zzzzzz', 0), '888888');
    });
});
