import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import GenerateImageTool from '../src/core/tools/GenerateImageTool';

describe('GenerateImageTool (AI Image Generation Tool)', () => {
    it('has valid tool definition matching OpenAI function calling schema', () => {
        const dummyService = { ready: true, generateImage: async () => Buffer.from('test') };
        const tool = new GenerateImageTool(dummyService);

        assert.equal(tool.definition.type, 'function');
        assert.equal(tool.definition.function.name, 'generate_image');
        assert.ok(tool.definition.function.description.includes('生成'));
        assert.ok(tool.definition.function.parameters.properties.prompt);
        assert.deepEqual(tool.definition.function.parameters.required, ['prompt']);
    });

    it('rejects execution when prompt is empty or missing', async () => {
        const dummyService = { ready: true, generateImage: async () => Buffer.from('test') };
        const tool = new GenerateImageTool(dummyService);

        const res1 = await tool.execute({});
        assert.ok(res1.includes('錯誤'));

        const res2 = await tool.execute({ prompt: '   ' });
        assert.ok(res2.includes('錯誤'));
    });

    it('rejects execution when image service is offline or not ready', async () => {
        const offlineService = { ready: false, generateImage: async () => Buffer.from('test') };
        const tool = new GenerateImageTool(offlineService);

        const res = await tool.execute({ prompt: 'a cute cat' });
        assert.ok(res.includes('未在線'));
    });

    it('executes image generation successfully and pushes Buffer attachment to context', async () => {
        const dummyBuffer = Buffer.from('fake-png-data');
        let calledPrompt = '';
        const dummyService = {
            ready: true,
            currentModel: 'gpt-image-2',
            generateImage: async (prompt) => {
                calledPrompt = prompt;
                return dummyBuffer;
            }
        };
        const tool = new GenerateImageTool(dummyService);

        const context = {};
        const res = await tool.execute({ prompt: 'a cute cat' }, context);

        assert.equal(calledPrompt, 'a cute cat');
        assert.ok(res.includes('已成功使用 gpt-image-2 生成圖片'));
        assert.ok(Array.isArray(context.attachments));
        assert.equal(context.attachments.length, 1);
        assert.ok(context.attachments[0].filename.endsWith('.png'));
        assert.equal(context.attachments[0].content, dummyBuffer);
    });

    it('catches and reports exceptions from image generation service', async () => {
        const failingService = {
            ready: true,
            currentModel: 'gpt-image-2',
            generateImage: async () => {
                throw new Error('API Rate Limit Exceeded');
            }
        };
        const tool = new GenerateImageTool(failingService);

        const res = await tool.execute({ prompt: 'draw fail' });
        assert.ok(res.includes('圖片生成失敗'));
        assert.ok(res.includes('API Rate Limit Exceeded'));
    });

    it('executes image-to-image edit when context contains images (魔改)', async () => {
        const dummyOutputBuffer = Buffer.from('modified-magic-png');
        let editPrompt = '';
        let passedRefImage = null;

        const dummyService = {
            ready: true,
            currentModel: 'gpt-image-2',
            generateImage: async () => {
                throw new Error('Should not call text-to-image when image is present');
            },
            editImage: async (refImage, prompt) => {
                passedRefImage = refImage;
                editPrompt = prompt;
                return dummyOutputBuffer;
            }
        };
        const tool = new GenerateImageTool(dummyService);

        const context = {
            images: ['data:image/png;base64,samplephoto']
        };
        const res = await tool.execute({ prompt: '魔改成賽博龐克風格' }, context);

        assert.equal(passedRefImage, 'data:image/png;base64,samplephoto');
        assert.equal(editPrompt, '魔改成賽博龐克風格');
        assert.ok(res.includes('魔改圖片'));
        assert.equal(context.attachments.length, 1);
        assert.ok(context.attachments[0].filename.startsWith('paimon_edit_'));
        assert.equal(context.attachments[0].content, dummyOutputBuffer);
    });

    it('handles multiple context images by using the first image and adding notice', async () => {
        const dummyOutputBuffer = Buffer.from('multi-img-handled');
        let usedImage = null;

        const dummyService = {
            ready: true,
            currentModel: 'gpt-image-2',
            editImage: async (refImage) => {
                usedImage = refImage;
                return dummyOutputBuffer;
            }
        };
        const tool = new GenerateImageTool(dummyService);

        const context = {
            images: ['image1_data', 'image2_data', 'image3_data']
        };
        const res = await tool.execute({ prompt: '將這張圖轉成動漫風' }, context);

        assert.equal(usedImage, 'image1_data');
        assert.ok(res.includes('限制最多使用 1 張參考圖'));
        assert.ok(res.includes('魔改圖片'));
        assert.equal(context.attachments.length, 1);
    });
});
