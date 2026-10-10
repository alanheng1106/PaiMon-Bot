import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const shutdownCommand = require('../src/commands/owner/shutdown').default || require('../src/commands/owner/shutdown');

describe('Shutdown Owner Command', () => {
    let originalOwnerId;
    let originalExit;

    beforeEach(() => {
        originalOwnerId = process.env.OWNER_ID;
        originalExit = process.exit;
    });

    afterEach(() => {
        process.env.OWNER_ID = originalOwnerId;
        process.exit = originalExit;
    });

    it('has correct slash command configuration', () => {
        assert.equal(shutdownCommand.data.name, 'shutdown');
        assert.equal(shutdownCommand.category, 'owner');
    });

    it('rejects execution if user is not the bot owner', async () => {
        process.env.OWNER_ID = 'owner-123';
        let errorSent = false;

        const mockInteraction = {
            user: { id: 'impostor-456' }
        };

        const mockBot = {
            sendError: async (interaction, title, description) => {
                errorSent = true;
                assert.equal(title, '權限不足');
            }
        };

        await shutdownCommand.execute(mockInteraction, mockBot);
        assert.equal(errorSent, true);
    });

    it('executes shutdown and exits process cleanly when invoked by owner', async () => {
        process.env.OWNER_ID = 'owner-123';
        let successSent = false;
        let shutdownCalled = false;
        let exitCode = null;

        process.exit = (code) => {
            exitCode = code;
        };

        const mockInteraction = {
            user: { id: 'owner-123', tag: 'Owner#0001' }
        };

        const mockBot = {
            sendSuccess: async () => {
                successSent = true;
            },
            shutdown: async (code) => {
                shutdownCalled = true;
                assert.equal(code, 0);
            }
        };

        await shutdownCommand.execute(mockInteraction, mockBot);
        assert.equal(successSent, true);
        assert.equal(shutdownCalled, true);
        assert.equal(exitCode, 0);
    });

    it('ensures process.exit(0) is executed in finally block even if bot.shutdown throws', async () => {
        process.env.OWNER_ID = 'owner-123';
        let exitCode = null;

        process.exit = (code) => {
            exitCode = code;
        };

        const mockInteraction = {
            user: { id: 'owner-123', tag: 'Owner#0001' }
        };

        const mockBot = {
            sendSuccess: async () => {},
            shutdown: async () => {
                throw new Error('Disk flush I/O failure');
            }
        };

        await shutdownCommand.execute(mockInteraction, mockBot);
        assert.equal(exitCode, 0, 'process.exit(0) must be called in finally');
    });
});
