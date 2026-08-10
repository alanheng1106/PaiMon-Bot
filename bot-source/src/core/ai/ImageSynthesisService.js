const { HfInference } = require('@huggingface/inference');

/**
 * ImageSynthesisService — Dedicated service for Hugging Face Text-to-Image generation and image utilities.
 * Refactored for Single Responsibility Principle (SRP).
 */
class ImageSynthesisService {
    #hfClient;
    #imageModel;

    constructor(options = {}) {
        const { hfClient = null, imageModel = null } = options;

        if (hfClient) {
            this.#hfClient = hfClient;
        } else if (process.env.HF_TOKEN) {
            this.#hfClient = new HfInference(process.env.HF_TOKEN);
        } else {
            console.warn('[AI:ImageSynthesis] HF_TOKEN is not set. Image generation features are disabled.');
            this.#hfClient = null;
        }

        this.#imageModel = imageModel || process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';
    }

    get ready() {
        return !!this.#hfClient;
    }

    async generateImage(prompt) {
        if (!this.ready) throw new Error('Image Generation is offline: HF_TOKEN missing.');

        try {
            const imageBlob = await this.#hfClient.textToImage({
                model: this.#imageModel,
                inputs: prompt
            });
            const arrayBuffer = await imageBlob.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error('[ImageSynthesisService] Text to Image failed:', error.message);
            throw error;
        }
    }

    async urlToBase64(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        } catch (error) {
            console.error('[ImageSynthesisService] urlToBase64 failed:', error.message);
            return null;
        }
    }
}

module.exports = ImageSynthesisService;
