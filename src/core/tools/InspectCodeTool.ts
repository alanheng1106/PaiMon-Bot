import BaseTool, { ToolDefinition } from './BaseTool';
import { Emojis } from '../../config';
import type LargeFileCache from '../ai/LargeFileCache';

export interface InspectCodeArgs {
    filename: string;
    start_line: number;
    end_line?: number;
}

/** Maximum lines the tool will return in a single call (prevents token bomb). */
const MAX_LINES_PER_CALL = 200;

/**
 * InspectCodeTool — Lets the AI page through large uploaded code files on demand.
 *
 * When a user uploads a large file (e.g. 8,000-line Assembly), AIStreamHandler
 * stores it in LargeFileCache and sends the AI only a lightweight outline.
 * The AI then calls this tool to read specific line ranges — exactly like an
 * engineer opening a file in an editor and jumping to the relevant section.
 *
 * Design:
 *  - Reads from LargeFileCache (injected via execute() context).
 *  - Returns formatted, line-numbered output for clarity.
 *  - Hard-caps at MAX_LINES_PER_CALL per invocation to prevent token blow-out.
 *  - Provides a helpful file directory listing when called with no/unknown filename.
 *
 * Follows Strategy Pattern (BaseTool) & Dependency Inversion (cache via context).
 */
class InspectCodeTool extends BaseTool {
    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'inspect_code',
                description:
                    '在目前對話的大型程式碼/文件快取中，讀取指定檔案（如程式碼或大型 PDF）的特定行範圍。' +
                    '當使用者上傳超大檔案（如數百至數千行的程式碼或長篇 PDF 文件）時，' +
                    '系統只會傳送結構大綱給你。使用此工具可按需翻閱任意區段，' +
                    '不要一次索取超過 200 行（系統會自動截斷）。' +
                    '當你需要分析特定函式、標籤、資料段或邏輯流程時，主動調用此工具讀取對應行數。',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description:
                                '要讀取的檔案名稱（含副檔名），例如 "main.asm"、"kernel.c"、"bot.py"。' +
                                '留空或傳入 "?" 可列出目前快取中的所有可用檔案。'
                        },
                        start_line: {
                            type: 'number',
                            description: '起始行號（1-indexed，包含）。例如 100 代表從第 100 行開始讀取。'
                        },
                        end_line: {
                            type: 'number',
                            description:
                                '結束行號（1-indexed，包含）。可選，省略時讀取至 start_line + 199 行（上限 200 行）。'
                        }
                    },
                    required: ['filename', 'start_line']
                }
            }
        };
    }

    override async execute(args: InspectCodeArgs | any, context: any = {}): Promise<string> {
        const cache: LargeFileCache | undefined = context.largeFileCache;
        const channelId: string | undefined = context.channelId;

        if (!cache || !channelId) {
            return '錯誤：inspect_code 工具需要 largeFileCache 與 channelId 注入到執行環境中。請確認 AppContainerBuilder 已正確設置。';
        }

        const filename = (args?.filename || '').trim();
        const startLine = Number(args?.start_line) || 1;
        let endLine = Number(args?.end_line) || 0;

        // List available files if filename is empty or "?"
        if (!filename || filename === '?') {
            const files = cache.listFiles(channelId);
            if (files.length === 0) {
                return '目前此頻道的快取中沒有任何大型程式碼檔案。（檔案快取 TTL 為 2 小時）';
            }
            const list = files
                .map(
                    (f) =>
                        `- **${f.filename}** — ${f.totalLines} 行 | ${(f.totalBytes / 1024).toFixed(1)} KB | 語言: ${f.language || '未知'}`
                )
                .join('\n');
            return `目前快取中的大型程式碼檔案（共 ${files.length} 個）：\n${list}`;
        }

        // Validate start_line
        if (!Number.isFinite(startLine) || startLine < 1) {
            return `錯誤：start_line 必須為正整數，收到的值為 ${args?.start_line}。`;
        }

        // Cap end_line
        if (!endLine || endLine < startLine) {
            endLine = startLine + MAX_LINES_PER_CALL - 1;
        }

        if (endLine - startLine + 1 > MAX_LINES_PER_CALL) {
            endLine = startLine + MAX_LINES_PER_CALL - 1;
        }

        // Retrieve file info first (for total line count)
        const entry = cache.get(channelId, filename);
        if (!entry) {
            const available = cache.listFiles(channelId);
            const hint =
                available.length > 0
                    ? `\n目前快取中可用的檔案：${available.map((f) => f.filename).join(', ')}`
                    : '\n目前此頻道無任何快取檔案。';
            return `錯誤：找不到快取的檔案 "${filename}"。（TTL 2 小時，上傳後可能已過期）${hint}`;
        }

        const fileLines = cache.readLines(channelId, filename, startLine, endLine);
        if (!fileLines) {
            return `錯誤：讀取 "${filename}" L${startLine}–L${endLine} 失敗，請確認行範圍有效。`;
        }

        const actualEnd = Math.min(endLine, entry.totalLines);
        const actualStart = Math.max(1, startLine);
        const linesShown = fileLines.length;
        const isTruncated = linesShown >= MAX_LINES_PER_CALL && actualEnd < entry.totalLines;

        // Format with line numbers for easy navigation
        const numbered = fileLines
            .map((line, i) => {
                const lineNo = (actualStart + i).toString().padStart(6);
                return `${lineNo} | ${line}`;
            })
            .join('\n');

        const lang = entry.language || '';
        const header =
            `📄 **${filename}** — L${actualStart}~L${actualEnd} ` +
            `（共 ${entry.totalLines} 行 | ${(entry.totalBytes / 1024).toFixed(1)} KB）`;

        const body = `\`\`\`${lang}\n${numbered}\n\`\`\``;

        const footer = isTruncated
            ? `\n> ${Emojis.Warning} 已達每次上限 ${MAX_LINES_PER_CALL} 行。如需繼續，請再次調用 \`inspect_code("${filename}", ${actualEnd + 1})\`。`
            : '';

        return `${header}\n${body}${footer}`;
    }
}

export default InspectCodeTool;
