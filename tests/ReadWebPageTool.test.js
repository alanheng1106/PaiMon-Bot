import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ReadWebPageTool from '../src/core/tools/ReadWebPageTool';
import { buildPdfWithPages } from './pdfTestHelper.js';

describe('ReadWebPageTool (Web Page Text Extraction Strategy)', () => {
    it('defines a valid function calling tool schema', () => {
        const tool = new ReadWebPageTool();
        const def = tool.definition;
        assert.equal(def.type, 'function');
        assert.equal(def.function.name, 'read_web_page');
        assert.ok(def.function.parameters.properties.url);
        assert.deepEqual(def.function.parameters.required, ['url']);
    });

    it('rejects invalid or missing URL parameters', async () => {
        const tool = new ReadWebPageTool();

        const res1 = await tool.execute({});
        assert.ok(res1.includes('請提供有效的網頁網址'));

        const res2 = await tool.execute({ url: 'not-a-url' });
        assert.ok(res2.includes('網址格式無效'));

        const res3 = await tool.execute({ url: 'ftp://files.example.com' });
        assert.ok(res3.includes('僅支援 HTTP 與 HTTPS'));
    });

    it('enforces SSRF protection against private, loopback, and local network addresses', async () => {
        const tool = new ReadWebPageTool();

        const res1 = await tool.execute({ url: 'http://localhost:3000/secret' });
        assert.ok(res1.includes('安全限制'));

        const res2 = await tool.execute({ url: 'http://127.0.0.1:8080/admin' });
        assert.ok(res2.includes('安全限制'));

        const res3 = await tool.execute({ url: 'http://192.168.1.1/router' });
        assert.ok(res3.includes('安全限制'));

        const res4 = await tool.execute({ url: 'http://10.0.0.1/metadata' });
        assert.ok(res4.includes('安全限制'));

        const res5 = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data' });
        assert.ok(res5.includes('安全限制'));
    });

    it('cleans HTML tags, scripts, and entities effectively', () => {
        const tool = new ReadWebPageTool();
        const dirtyHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Test Page</title>
                    <script>alert("hack");</script>
                    <style>body { color: red; }</style>
                </head>
                <body>
                    <h1>Welcome &amp; Hello</h1>
                    <p>This is a paragraph with &quot;quotes&quot; and &lt;brackets&gt;.</p>
                    <div><span>Some extra details &mdash; clean text</span></div>
                </body>
            </html>
        `;

        const cleaned = tool.cleanHtml(dirtyHtml);
        assert.ok(!cleaned.includes('alert'));
        assert.ok(!cleaned.includes('<script>'));
        assert.ok(!cleaned.includes('color: red'));
        assert.ok(cleaned.includes('Welcome & Hello'));
        assert.ok(cleaned.includes('quotes'));
        assert.ok(cleaned.includes('brackets'));
    });

    it('emits onUpdate with loading emoji when reading web page', async () => {
        const tool = new ReadWebPageTool();
        let updateMessage = '';
        await tool.execute(
            { url: 'https://example.com' },
            {
                onUpdate: (msg) => {
                    updateMessage = msg;
                }
            }
        );
        assert.ok(updateMessage.includes('<a:loading:1551489203013947422>'));
        assert.ok(updateMessage.includes('正在讀取網頁'));
    });

    it('reads and extracts plain text from online PDF document', async () => {
        const tool = new ReadWebPageTool();
        const originalFetch = globalThis.fetch;
        const pdfBytes = buildPdfWithPages(['Online PDF Content Sample']);

        globalThis.fetch = async (url) => {
            if (String(url).includes('sample.pdf')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Headers({
                        'content-type': 'application/pdf'
                    }),
                    arrayBuffer: async () => pdfBytes.buffer
                };
            }
            return { ok: false, status: 404, statusText: 'Not Found' };
        };

        try {
            const result = await tool.execute({ url: 'https://example.com/sample.pdf' });
            assert.ok(result.includes('[PDF 內容來源: https://example.com/sample.pdf（共 1 頁）]'));
            assert.ok(result.includes('Online PDF Content Sample'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('handles online PDF with no extractable text gracefully', async () => {
        const tool = new ReadWebPageTool();
        const originalFetch = globalThis.fetch;
        const emptyPdfBytes = buildPdfWithPages(['']);

        globalThis.fetch = async (url) => {
            if (String(url).includes('empty.pdf')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Headers({
                        'content-type': 'application/pdf'
                    }),
                    arrayBuffer: async () => emptyPdfBytes.buffer
                };
            }
            return { ok: false, status: 404, statusText: 'Not Found' };
        };

        try {
            const result = await tool.execute({ url: 'https://example.com/empty.pdf' });
            assert.ok(result.includes('未偵測到純文字內容（可能為純圖片掃描檔或加密文件）'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
