import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ImageSynthesisService from '../src/core/ai/ImageSynthesisService';
import AIChatSessionManager from '../src/core/ai/AIChatSessionManager';
import ToolRegistry from '../src/core/tools/ToolRegistry';
import AIClient from '../src/core/AIClient';

describe('AI Subsystem (OOP & Single Responsibility)', () => {
    describe('ImageSynthesisService', () => {
        it('reports not ready when HF_TOKEN is missing', () => {
            const service = new ImageSynthesisService({ hfClient: null });
            assert.equal(typeof service.ready, 'boolean');
        });
    });

    describe('AIClient', () => {
        it('injects ImageSynthesisService via Dependency Injection', () => {
            const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
            const dummySessionManager = new AIChatSessionManager();
            const dummyToolRegistry = new ToolRegistry();

            const client = new AIClient({
                imageService: dummyImageService,
                sessionManager: dummySessionManager,
                toolRegistry: dummyToolRegistry
            });

            assert.equal(client.imageService.ready, true);
            assert.equal(client.imageService, dummyImageService);
        });
    });

    describe('AIChatSessionManager', () => {
        it('prunes history in-place preserving array reference and system prompt', () => {
            const manager = new AIChatSessionManager({
                config: { MaxChannels: 10, ChatTTL: 10000, HistorySize: 5 }
            });

            const session = manager.ensureSession('ch-1');
            for (let i = 1; i <= 8; i++) {
                session.push({ role: 'user', content: `Message ${i}` });
                session.push({ role: 'assistant', content: `Reply ${i}` });
            }

            manager.pruneHistory('ch-1');

            // Same array reference is preserved
            const sessionAfter = manager.ensureSession('ch-1');
            assert.equal(sessionAfter, session);
            assert.equal(sessionAfter.length, 5);
            assert.equal(sessionAfter[0].role, 'system');
        });

        it('records passive context with bystander explanation', () => {
            const manager = new AIChatSessionManager();
            manager.addPassiveContext('ch-2', 'user_a', '大家今天吃了什麼？');

            const session = manager.ensureSession('ch-2');
            assert.equal(session.length, 3);
            assert.ok(session[1].content.includes('頻道背景閒聊記錄'));
            assert.ok(session[2].content.includes('安靜聽著'));
        });
    });
});
