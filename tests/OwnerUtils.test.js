import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import OwnerUtils from '../src/utils/OwnerUtils';

describe('OwnerUtils (Bot Ownership Verification)', () => {
    let originalOwnerId;

    beforeEach(() => {
        originalOwnerId = process.env.OWNER_ID;
    });

    afterEach(() => {
        process.env.OWNER_ID = originalOwnerId;
    });

    it('identifies single configured owner ID correctly', () => {
        process.env.OWNER_ID = '123456789012345678';
        assert.equal(OwnerUtils.isOwner('123456789012345678'), true);
        assert.equal(OwnerUtils.isOwner('999999999999999999'), false);
    });

    it('supports comma-separated list of multiple owner IDs with whitespace trimming', () => {
        process.env.OWNER_ID = '  111111111111111111,  222222222222222222 , 333333333333333333  ';
        assert.equal(OwnerUtils.isOwner('111111111111111111'), true);
        assert.equal(OwnerUtils.isOwner('222222222222222222'), true);
        assert.equal(OwnerUtils.isOwner('333333333333333333'), true);
        assert.equal(OwnerUtils.isOwner('444444444444444444'), false);
    });

    it('safely handles trailing commas and blank entries without false positive matches', () => {
        process.env.OWNER_ID = '111111111111111111, , 222222222222222222, ,';
        assert.equal(OwnerUtils.isOwner('111111111111111111'), true);
        assert.equal(OwnerUtils.isOwner('222222222222222222'), true);
        assert.equal(OwnerUtils.isOwner(''), false);
        assert.equal(OwnerUtils.isOwner(' '), false);
    });

    it('safely rejects all users when OWNER_ID is unset, empty, or whitespace only', () => {
        delete process.env.OWNER_ID;
        assert.equal(OwnerUtils.isOwner('123456789012345678'), false);
        assert.equal(OwnerUtils.isOwner(''), false);

        process.env.OWNER_ID = '';
        assert.equal(OwnerUtils.isOwner('123456789012345678'), false);

        process.env.OWNER_ID = '   ';
        assert.equal(OwnerUtils.isOwner('123456789012345678'), false);

        process.env.OWNER_ID = ', , ,';
        assert.equal(OwnerUtils.isOwner('123456789012345678'), false);
    });

    it('defensively rejects invalid input types (null, undefined, numbers, non-strings)', () => {
        process.env.OWNER_ID = '123456789012345678';
        assert.equal(OwnerUtils.isOwner(null), false);
        assert.equal(OwnerUtils.isOwner(undefined), false);
        assert.equal(OwnerUtils.isOwner(123456789012345678), false);
        assert.equal(OwnerUtils.isOwner({}), false);
        assert.equal(OwnerUtils.isOwner([]), false);
    });

    it('trims input userId before matching', () => {
        process.env.OWNER_ID = '123456789012345678';
        assert.equal(OwnerUtils.isOwner('  123456789012345678  '), true);
    });
});
