import BaseTool, { ToolDefinition } from './BaseTool';

export interface CreateFileToolArgs {
    filename: string;
    content: string;
}

/**
 * CreateFileTool — Enables AI to generate downloadable files as Discord attachments.
 * Follows Strategy Pattern (BaseTool) & Single Responsibility Principle (SRP).
 */
class CreateFileTool extends BaseTool {
    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'create_file',
                description:
                    '用於生成供使用者下載的檔案附件。當生成完整程式碼、獨立腳本、專案檔案、長篇代碼（超過 15 行）、文字報告或資料時，必須調用此工具生成檔案供用戶下載，避免在聊天訊息中洗版。支援 .py, .js, .ts, .json, .txt, .csv, .md, .html 等各類副檔名。',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: '檔案名稱與副檔名，例如 choice_bot.py, script.js, data.json, notes.txt'
                        },
                        content: {
                            type: 'string',
                            description: '檔案的完整文字內容'
                        }
                    },
                    required: ['filename', 'content']
                }
            }
        };
    }

    /**
     * Execute file creation tool strategy.
     */
    override async execute(args: CreateFileToolArgs | any, context: any = {}): Promise<string> {
        const { filename, content } = args;
        if (!filename || !content) {
            return '錯誤：必須提供 filename 與 content。';
        }

        const safeFilename = filename.trim().replace(/[/\\?%*:|"<>]/g, '_');

        if (!context.attachments) {
            context.attachments = [];
        }

        context.attachments.push({
            filename: safeFilename,
            content
        });

        return `已成功生成檔案 [${safeFilename}] (${Buffer.byteLength(content, 'utf8')} 位元組)。檔案將自動附在 Discord 訊息中供使用者直接下載使用。`;
    }
}

export default CreateFileTool;
