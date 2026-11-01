import OpenAI from 'openai';
import { HfInference } from '@huggingface/inference';
import { AI } from '../../config';

export interface ImageSynthesisOptions {
    client?: OpenAI | null;
    baseURL?: string | null;
    apiKey?: string | null;
    model?: string | null;
    defaultSize?: string;
    hfClient?: HfInference | null;
    hfModel?: string | null;
}

/**
 * ImageSynthesisService — Dedicated service for AI Text-to-Image generation and image utilities.
 * Supports:
 * - OpenAI-compatible image generation (e.g. gpt-image-2 on VTC Gateway / Azure OpenAI)
 * - Hugging Face inference fallback
 * Follows Single Responsibility Principle (SRP) & Dependency Inversion Principle (DIP).
 */
class ImageSynthesisService {
    #openaiClient: OpenAI | null = null;
    #hfClient: HfInference | null = null;
    #baseURL: string = '';
    #apiKey: string = '';
    #model: string;
    #hfModel: string;
    #defaultSize: string;

    constructor(options: ImageSynthesisOptions = {}) {
        const {
            client = null,
            baseURL = process.env.WINDOWSED_AI_BASE_URL ||
                process.env.VTC_AI_BASE_URL ||
                process.env.FRIEND_AI_BASE_URL ||
                'https://ai.windowsed.me/v1',
            apiKey = process.env.WINDOWSED_AI_API_KEY ||
                process.env.VTC_AI_API_KEY ||
                process.env.FRIEND_AI_API_KEY ||
                '',
            model = process.env.VTC_IMAGE_MODEL || AI.DefaultImageModel || 'gpt-image-2',
            defaultSize = AI.DefaultImageSize || '3840x2160',
            hfClient = null,
            hfModel = process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0'
        } = options;

        this.#model = model || process.env.VTC_IMAGE_MODEL || AI.DefaultImageModel || 'gpt-image-2';
        this.#hfModel = hfModel || process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';
        this.#defaultSize = defaultSize || '3840x2160';
        this.#baseURL = baseURL || (client as any)?.baseURL || 'https://ai.windowsed.me/v1';
        this.#apiKey = apiKey || (client as any)?.apiKey || '';

        if (client) {
            this.#openaiClient = client;
        } else if (apiKey) {
            this.#openaiClient = new OpenAI({
                baseURL: baseURL || 'https://ai.windowsed.me/v1',
                apiKey
            });
        }

        if (hfClient) {
            this.#hfClient = hfClient;
        } else if (process.env.HF_TOKEN) {
            this.#hfClient = new HfInference(process.env.HF_TOKEN);
        }
    }

    get ready(): boolean {
        return !!this.#openaiClient || !!this.#hfClient;
    }

    get currentModel(): string {
        if (this.#openaiClient) return this.#model;
        if (this.#hfClient) return this.#hfModel;
        return 'offline';
    }

    get defaultSize(): string {
        return this.#defaultSize;
    }

    async #fetchBoundedBuffer(url: string, label: string, maxBytes: number = 25 * 1024 * 1024): Promise<Buffer> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`無法下載${label}: ${res.statusText}`);
        const cl = parseInt(res.headers?.get?.('content-length') || '', 10);
        if (!isNaN(cl) && cl > maxBytes) {
            throw new Error(`${label}大小超過上限 (${Math.round(maxBytes / 1024 / 1024)}MB)`);
        }
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > maxBytes) {
            throw new Error(`${label}大小超過上限 (${Math.round(maxBytes / 1024 / 1024)}MB)`);
        }
        return Buffer.from(arrayBuf);
    }

    /**
     * Generates an image from a text prompt and returns the raw Buffer.
     * Default resolution is 3840x2160 (4K UHD) for gpt-image-2.
     */
    async generateImage(
        prompt: string,
        size: '3840x2160' | '1024x1024' | '512x512' | string = this.#defaultSize
    ): Promise<Buffer> {
        if (!this.ready) {
            throw new Error('圖片生成服務未就緒：未配置 API 金鑰。');
        }

        // 1. Primary: OpenAI-compatible image endpoint (e.g. gpt-image-2)
        if (this.#openaiClient) {
            try {
                const response = await this.#openaiClient.images.generate({
                    model: this.#model,
                    prompt,
                    n: 1,
                    size: (size || this.#defaultSize) as any
                });

                const imgData = response.data?.[0];
                if (imgData?.b64_json) {
                    return Buffer.from(imgData.b64_json, 'base64');
                }

                if (imgData?.url) {
                    return await this.#fetchBoundedBuffer(imgData.url, '生成圖片');
                }

                throw new Error('API 回應未包含圖片資料 (b64_json 或 url)。');
            } catch (error: any) {
                console.error('[ImageSynthesisService] OpenAI Image Gen failed:', error.message);
                // If HF fallback is available, try fallback
                if (!this.#hfClient) throw error;
            }
        }

        // 2. Fallback: Hugging Face
        if (this.#hfClient) {
            try {
                const imageBlob = await this.#hfClient.textToImage({
                    model: this.#hfModel,
                    inputs: prompt
                });
                const arrayBuffer = await (imageBlob as any).arrayBuffer();
                return Buffer.from(arrayBuffer);
            } catch (error: any) {
                console.error('[ImageSynthesisService] HF Text to Image failed:', error.message);
                throw error;
            }
        }

        throw new Error('所有可用之圖片生成提供商均無法完成請求。');
    }

    /**
     * Edits or transforms an existing reference image using the OpenAI-compatible /images/edits endpoint.
     * Supports up to 1 reference image (enforced by GPT Image 2 backend on ai.windowsed.me).
     */
    async editImage(
        referenceImage: Buffer | string,
        prompt: string,
        size: '3840x2160' | '1024x1024' | '512x512' | string = this.#defaultSize
    ): Promise<Buffer> {
        if (!this.ready) {
            throw new Error('圖片生成服務未就緒：未配置 API 金鑰。');
        }

        // Convert referenceImage to Buffer if string
        let buffer: Buffer;
        if (Buffer.isBuffer(referenceImage)) {
            buffer = referenceImage;
        } else if (typeof referenceImage === 'string') {
            if (referenceImage.startsWith('data:')) {
                const base64Part = referenceImage.split(',')[1] || referenceImage;
                buffer = Buffer.from(base64Part, 'base64');
            } else if (referenceImage.startsWith('http://') || referenceImage.startsWith('https://')) {
                buffer = await this.#fetchBoundedBuffer(referenceImage, '參考圖片');
            } else {
                buffer = Buffer.from(referenceImage, 'base64');
            }
        } else {
            throw new Error('不支援的參考圖片格式。');
        }

        // 1. If custom client is provided with mock edit method (useful in testing)
        if (this.#openaiClient && typeof (this.#openaiClient.images as any)?.edit === 'function' && !this.#apiKey) {
            try {
                const response = await (this.#openaiClient.images as any).edit({
                    image: buffer,
                    prompt,
                    model: this.#model,
                    size: size || this.#defaultSize
                });
                const imgData = response.data?.[0];
                if (imgData?.b64_json) {
                    return Buffer.from(imgData.b64_json, 'base64');
                }
                if (imgData?.url) {
                    return await this.#fetchBoundedBuffer(imgData.url, '生成圖片');
                }
            } catch (err: any) {
                console.error('[ImageSynthesisService] Mock client editImage failed:', err.message);
                throw err;
            }
        }

        // 2. Primary: Standard fetch with FormData to /images/edits endpoint
        if (this.#baseURL && this.#apiKey) {
            try {
                const formData = new FormData();
                const blob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
                formData.append('image', blob, 'reference.png');
                formData.append('prompt', prompt);
                if (this.#model) {
                    formData.append('model', this.#model);
                }
                const targetSize = size || this.#defaultSize;
                if (targetSize) {
                    formData.append('size', targetSize);
                }

                const endpoint = `${this.#baseURL.replace(/\/+$/, '')}/images/edits`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.#apiKey}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    let errMsg = response.statusText;
                    try {
                        const parsed = JSON.parse(errBody);
                        if (parsed.error?.message) errMsg = parsed.error.message;
                    } catch {
                        if (errBody) errMsg = errBody.slice(0, 200);
                    }
                    throw new Error(`[${response.status}] ${errMsg}`);
                }

                const resJson = (await response.json()) as any;
                const imgData = resJson.data?.[0];
                if (imgData?.b64_json) {
                    return Buffer.from(imgData.b64_json, 'base64');
                }
                if (imgData?.url) {
                    return await this.#fetchBoundedBuffer(imgData.url, '魔改生成圖片');
                }

                throw new Error('API 回應未包含圖片資料 (b64_json 或 url)。');
            } catch (error: any) {
                console.error('[ImageSynthesisService] Image Edit (Image-to-Image) failed:', error.message);
                throw error;
            }
        }

        // Fallback: If no edits endpoint is configured, fall back to generateImage
        console.warn('[ImageSynthesisService] Edit endpoint not available, falling back to generateImage');
        return this.generateImage(prompt, size);
    }
}

export default ImageSynthesisService;
