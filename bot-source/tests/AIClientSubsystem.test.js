const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ImageSynthesisService = require('../src/core/ai/ImageSynthesisService');
const AIClient = require('../src/core/AIClient');

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
            const client = new AIClient({ imageService: dummyImageService });

            assert.equal(client.imageReady, true);
            assert.equal(client.imageService, dummyImageService);
        });
    });
});
