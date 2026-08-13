const BaseTool = require('./BaseTool');

/**
 * CreateFileTool — Enables AI to generate downloadable files as Discord attachments.
 * Follows Strategy Pattern (BaseTool) & Single Responsibility Principle (SRP).
 */
class CreateFileTool extends BaseTool {
    get definition() {
        return {
            type: 'function',
            function: {
                name: 'create_file',
                description: '當使用者要求將程式碼、文字、Markdown 或資料輸出/下載成檔案時使用此工具。生成檔案並附在 Discord 訊息中供使用者下載。支援 .py, .js, .txt, .json, .csv, .md, .html 等',
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
     * @param {Object} args - { filename, content }
     * @param {Object} context - Execution context containing attachments collector array
     * @returns {Promise<string>}
     */
    async execute(args, context = {}) {
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

module.exports = CreateFileTool;
