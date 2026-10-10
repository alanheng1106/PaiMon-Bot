import BaseTool, { ToolDefinition } from './BaseTool';
import { Emojis } from '../../config';
import { isPdf, extractTextFromPDF } from '../../utils/PDFUtils';

/**
 * ReadWebPageTool — Tool strategy for reading and extracting clean text from webpage URLs and PDF documents.
 * Includes SSRF safety guards, timeout handling, HTML normalization, and PDF text extraction.
 */
class ReadWebPageTool extends BaseTool {
    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'read_web_page',
                description:
                    'Fetch and read readable text content of a web page URL or online PDF document. Use this tool when a user provides a link or when you need detailed text from a website or PDF document.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The HTTP or HTTPS URL of the web page or PDF document to read.'
                        }
                    },
                    required: ['url']
                }
            }
        };
    }

    override async execute(args: { url: string } | any, context: any = {}): Promise<string> {
        const rawUrl = args?.url;
        if (!rawUrl || typeof rawUrl !== 'string') {
            return '錯誤: 請提供有效的網頁網址 (URL)。';
        }

        const trimmedUrl = rawUrl.trim();
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(trimmedUrl);
        } catch {
            return `錯誤: 網址格式無效: "${trimmedUrl}"`;
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return '錯誤: 僅支援 HTTP 與 HTTPS 協定的網址。';
        }

        // SSRF Safety guard: Block access to localhost, link-local, and private loopback addresses
        const hostname = parsedUrl.hostname.toLowerCase();
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname === '::1' ||
            hostname.endsWith('.local') ||
            hostname.startsWith('169.254.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
        ) {
            return '安全限制: 無法存取本機或內部私有網路網址。';
        }

        if (context?.onUpdate) {
            context.onUpdate(`${Emojis.Loading} *(正在讀取網頁: ${hostname}...)*`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(parsedUrl.toString(), {
                signal: controller.signal,
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/pdf;q=0.8,*/*;q=0.5'
                }
            });

            if (!response.ok) {
                return `無法載入網頁 (HTTP ${response.status} ${response.statusText}): ${trimmedUrl}`;
            }

            const contentType = response.headers.get('content-type') || '';
            const isPdfDocument = isPdf(contentType, parsedUrl.pathname);

            if (isPdfDocument) {
                if (context?.onUpdate) {
                    context.onUpdate(`${Emojis.Loading} *(正在下載並解析 PDF 文件: ${hostname}...)*`);
                }
                try {
                    const arrayBuffer = await response.arrayBuffer();
                    const { text: pdfText, totalPages, isEmpty } = await extractTextFromPDF(arrayBuffer, {
                        maxChars: 15000
                    });

                    if (isEmpty) {
                        return `[PDF 來源: ${trimmedUrl}]\nPDF 文件載入成功（共 ${totalPages} 頁），但未偵測到純文字內容（可能為純圖片掃描檔或加密文件）。`;
                    }

                    return `[PDF 內容來源: ${trimmedUrl}（共 ${totalPages} 頁）]\n\n${pdfText}`;
                } catch (pdfErr: any) {
                    return `讀取 PDF 失敗: ${pdfErr.message}`;
                }
            }

            if (
                contentType.includes('image/') ||
                contentType.includes('audio/') ||
                contentType.includes('video/') ||
                contentType.includes('application/zip') ||
                contentType.includes('application/octet-stream')
            ) {
                return `網頁為二進位檔案 (${contentType})，無法以純文字解析。`;
            }

            const html = await response.text();
            const extractedText = this.cleanHtml(html);

            if (!extractedText) {
                return `網頁載入成功，但未取得有效文字內容: ${trimmedUrl}`;
            }

            const maxChars = 3500;
            const truncated =
                extractedText.length > maxChars
                    ? extractedText.slice(0, maxChars) + '\n\n...[網頁內容過長，已截断]'
                    : extractedText;

            return `[網頁內容來源: ${trimmedUrl}]\n\n${truncated}`;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return `載入網頁或下載檔案逾時 (超過 20 秒): ${trimmedUrl}`;
            }
            return `讀取網頁失敗: ${error.message}`;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    cleanHtml(html: string): string {
        if (!html) return '';

        let text = html;

        // 1. Remove scripts, styles, svg, and noscript elements
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
        text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
        text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
        text = text.replace(/<!--[\s\S]*?-->/g, ' ');

        // 2. Convert common block-level elements to newlines
        text = text.replace(/<\/(p|div|h[1-6]|li|tr|article|section)>/gi, '\n');
        text = text.replace(/<br\s*\/?>/gi, '\n');

        // 3. Strip all remaining HTML tags
        text = text.replace(/<[^>]+>/g, ' ');

        // 4. Decode common HTML entities
        text = text
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&mdash;/gi, '—')
            .replace(/&ndash;/gi, '–');

        // 5. Normalize whitespace and multiple empty lines
        text = text
            .split('\n')
            .map((line) => line.replace(/[ \t]+/g, ' ').trim())
            .filter((line) => line.length > 0)
            .join('\n');

        return text.trim();
    }
}

export default ReadWebPageTool;
