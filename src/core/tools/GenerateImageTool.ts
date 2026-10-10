import BaseTool, { ToolDefinition } from './BaseTool';
import type ImageSynthesisService from '../ai/ImageSynthesisService';

export interface GenerateImageToolArgs {
    prompt: string;
}

/**
 * GenerateImageTool — Enables AI to generate images using gpt-image-2 as Discord attachments.
 * Follows Strategy Pattern (BaseTool) & Single Responsibility Principle (SRP).
 */
class GenerateImageTool extends BaseTool {
    #imageService: ImageSynthesisService;

    constructor(imageService: ImageSynthesisService) {
        super();
        this.#imageService = imageService;
    }

    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'generate_image',
                description:
                    'AI 繪圖與圖像生成/魔改工具。當使用者要求畫圖、繪製插圖、生成畫面、製作圖片、繪畫，或上傳照片要求「魔改」、改圖、換風格、二次元化、圖生圖、修圖時，必須調用此工具生成 3840×2160 (4K) 圖片。若使用者有上傳照片，系統會自動將照片作為參考圖送入進行圖生圖魔改。禁止在文字中只說自己會畫或會改卻不調用此工具。',
                parameters: {
                    type: 'object',
                    properties: {
                        prompt: {
                            type: 'string',
                            description:
                                '詳細豐富的畫面描述（Prompt）。若為魔改/改圖，請詳細描述目標轉換風格與畫面特徵；建議包含主體特徵、動作、背景環境、光影氛圍、藝術風格（例如 cinematic, photorealistic, anime, cyberpunk, 4k/8k 等），可中英文混合或純英文以獲得最佳畫質'
                        }
                    },
                    required: ['prompt']
                }
            }
        };
    }

    override async execute(args: GenerateImageToolArgs | any, context: any = {}): Promise<string> {
        const prompt = args?.prompt?.trim();
        if (!prompt) {
            return '錯誤：必須提供圖片描述提示詞 (prompt)。';
        }

        if (!this.#imageService || !this.#imageService.ready) {
            return '圖片生成服務當前未在線或未就緒。';
        }

        try {
            // Check if there are reference images attached in the conversation turn
            const refImages = Array.isArray(context?.images) ? context.images : [];
            const hasReferenceImage = refImages.length > 0;
            const isEditing = hasReferenceImage;

            if (typeof context?.onUpdate === 'function') {
                const previewPrompt = prompt.length > 30 ? `${prompt.slice(0, 30)}...` : prompt;
                if (isEditing) {
                    await context.onUpdate(
                        `> 🎨 *派蒙正在基於你上傳的照片進行 4K 作品魔改「${previewPrompt}」中，請稍候片刻...*`
                    );
                } else {
                    await context.onUpdate(`> 🎨 *派蒙正在揮灑畫筆繪製 4K 作品「${previewPrompt}」中，請稍候片刻...*`);
                }
            }

            let buffer: Buffer;
            let actionType = '生成';
            if (isEditing && typeof this.#imageService.editImage === 'function') {
                // ai.windowsed.me backend enforces up to 1 reference image
                const targetRefImage = refImages[0];
                buffer = await this.#imageService.editImage(targetRefImage, prompt, '3840x2160');
                actionType = '魔改';
            } else {
                buffer = await this.#imageService.generateImage(prompt, '3840x2160');
            }

            const prefix = isEditing ? 'paimon_edit_' : 'paimon_art_';
            const filename = `${prefix}${Date.now()}.png`;

            if (!context.attachments) {
                context.attachments = [];
            }

            context.attachments.push({
                filename,
                content: buffer
            });

            const multiNote =
                refImages.length > 1
                    ? '（💡 提示：API 圖像編輯引擎限制最多使用 1 張參考圖，已為你使用第一張照片作為基準進行魔改）'
                    : '';

            return `已成功使用 ${this.#imageService.currentModel} ${actionType}圖片 (4K 3840×2160)！檔案 [${filename}] 已附在訊息中呈現給使用者。${multiNote}請在後續回覆中以派蒙生動熱情的語氣向使用者介紹這張作品！`;
        } catch (err: any) {
            console.error('[GenerateImageTool] Image generation/editing failed:', err.message);
            return `圖片生成失敗：${err.message}`;
        }
    }
}

export default GenerateImageTool;
