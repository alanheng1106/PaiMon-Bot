const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const FileSessionRepository = require('../src/core/valorant/FileSessionRepository');
const RiotAuthenticator = require('../src/core/valorant/RiotAuthenticator');
const ValorantClient = require('../src/core/ValorantClient');

describe('Valorant Subsystem (OOP & SOLID Architecture)', () => {
    const testDir = path.join(__dirname, 'temp_val_test');
    const testFile = path.join(testDir, 'val-sessions-test.json');

    before(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    after(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('FileSessionRepository', () => {
        it('stores, retrieves, and removes user sessions in memory and disk', () => {
            const repo = new FileSessionRepository(testDir, testFile, 'test-key-123');

            assert.equal(repo.getUserSessions('user1'), null);

            repo.setSession('user1', 'Player#1234', { accessToken: 'token_abc', shard: 'ap' });
            const sessions = repo.getUserSessions('user1');
            assert.ok(sessions);
            assert.equal(sessions['Player#1234'].accessToken, 'token_abc');

            repo.flush();
            assert.equal(fs.existsSync(testFile), true);

            // Re-instantiate repo to test decrypted disk load
            const loadedRepo = new FileSessionRepository(testDir, testFile, 'test-key-123');
            const loadedSessions = loadedRepo.getUserSessions('user1');
            assert.ok(loadedSessions);
            assert.equal(loadedSessions['Player#1234'].accessToken, 'token_abc');

            loadedRepo.removeSession('user1', 'Player#1234');
            assert.equal(loadedRepo.getUserSessions('user1'), null);
        });
    });

    describe('RiotAuthenticator', () => {
        it('parses access_token and id_token correctly from URI fragment', () => {
            const authenticator = new RiotAuthenticator();
            const uri = 'https://playvalorant.com/opt_in#access_token=my_access_token&id_token=my_id_token&expires_in=3600';
            const tokens = authenticator.parseTokenFromUri(uri);

            assert.equal(tokens.accessToken, 'my_access_token');
            assert.equal(tokens.idToken, 'my_id_token');
            assert.equal(tokens.expiresIn, 3600);
        });
    });

    describe('ValorantClient (Facade Integration)', () => {
        it('delegates session operations cleanly to sessionRepo', () => {
            const repo = new FileSessionRepository(testDir, path.join(testDir, 'facade.json'), 'test-key');
            const client = new ValorantClient({ sessionRepo: repo });

            client.addSession('user2', 'Agent#007', { accessToken: 'secret_token', tokenExpiresAt: Date.now() + 100000 });
            const sessions = client.getSessions('user2');
            assert.ok(sessions);
            assert.equal(sessions['Agent#007'].accessToken, 'secret_token');

            client.removeAllSessions('user2');
            assert.equal(client.getSessions('user2'), null);
        });
    });
});
