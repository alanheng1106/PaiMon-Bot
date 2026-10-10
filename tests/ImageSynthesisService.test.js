import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ImageSynthesisService from '../src/core/ai/ImageSynthesisService';

describe('ImageSynthesisService', () => {
    it('initializes with OpenAI client and reports ready state', () => {
        const dummyClient = {
            images: {
                generate: async () => ({ data: [{ b64_json: Buffer.from('img').toString('base64') }] })
            }
        };

        const service = new ImageSynthesisService({
            client: dummyClient,
            model: 'gpt-image-2'
        });

        assert.equal(service.ready, true);
        assert.equal(service.currentModel, 'gpt-image-2');
    });

    it('generates image successfully using OpenAI client with base64 response', async () => {
        const testBuffer = Buffer.from('hello-image-data');
        const dummyClient = {
            images: {
                generate: async (options) => {
                    assert.equal(options.model, 'gpt-image-2');
                    assert.equal(options.prompt, 'a beautiful galaxy');
                    assert.equal(options.size, '3840x2160');
                    return {
                        data: [{ b64_json: testBuffer.toString('base64') }]
                    };
                }
            }
        };

        const service = new ImageSynthesisService({
            client: dummyClient,
            model: 'gpt-image-2'
        });

        const result = await service.generateImage('a beautiful galaxy');
        assert.ok(Buffer.isBuffer(result));
        assert.equal(result.toString(), 'hello-image-data');
    });

    it('supports custom size override (e.g. 1024x1024)', async () => {
        let passedSize = '';
        const dummyClient = {
            images: {
                generate: async (options) => {
                    passedSize = options.size;
                    return {
                        data: [{ b64_json: Buffer.from('img').toString('base64') }]
                    };
                }
            }
        };

        const service = new ImageSynthesisService({
            client: dummyClient,
            model: 'gpt-image-2'
        });

        await service.generateImage('test prompt', '1024x1024');
        assert.equal(passedSize, '1024x1024');
    });

    it('throws when service is offline or not ready', async () => {
        const service = new ImageSynthesisService({
            client: null,
            apiKey: null,
            hfClient: null
        });

        await assert.rejects(async () => {
            await service.generateImage('test prompt');
        });
    });

    it('edits image successfully with Buffer reference image using mock client', async () => {
        const testBuffer = Buffer.from('original-image');
        const outputBuffer = Buffer.from('edited-image-result');
        let receivedImageBuffer = null;
        let receivedPrompt = '';

        const dummyClient = {
            images: {
                generate: async () => ({ data: [] }),
                edit: async (options) => {
                    receivedImageBuffer = options.image;
                    receivedPrompt = options.prompt;
                    return {
                        data: [{ b64_json: outputBuffer.toString('base64') }]
                    };
                }
            }
        };

        const service = new ImageSynthesisService({
            client: dummyClient,
            model: 'gpt-image-2',
            apiKey: ''
        });

        const result = await service.editImage(testBuffer, 'make it cyberpunk');
        assert.ok(Buffer.isBuffer(result));
        assert.equal(result.toString(), 'edited-image-result');
        assert.equal(receivedImageBuffer, testBuffer);
        assert.equal(receivedPrompt, 'make it cyberpunk');
    });

    it('converts base64 data URL string to Buffer and edits image', async () => {
        const inputBase64 = Buffer.from('photo-input').toString('base64');
        const outputBuffer = Buffer.from('transformed-photo');
        let receivedBuffer = null;

        const dummyClient = {
            images: {
                generate: async () => ({ data: [] }),
                edit: async (options) => {
                    receivedBuffer = options.image;
                    return {
                        data: [{ b64_json: outputBuffer.toString('base64') }]
                    };
                }
            }
        };

        const service = new ImageSynthesisService({
            client: dummyClient,
            model: 'gpt-image-2',
            apiKey: ''
        });

        const result = await service.editImage(`data:image/png;base64,${inputBase64}`, 'convert to anime');
        assert.ok(Buffer.isBuffer(result));
        assert.equal(result.toString(), 'transformed-photo');
        assert.ok(Buffer.isBuffer(receivedBuffer));
        assert.equal(receivedBuffer.toString(), 'photo-input');
    });

    it('rejects editImage when service is offline', async () => {
        const service = new ImageSynthesisService({
            client: null,
            apiKey: null,
            hfClient: null
        });

        await assert.rejects(async () => {
            await service.editImage(Buffer.from('test'), 'prompt');
        });
    });
});
