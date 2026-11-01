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

    describe('SSRF Hardening & IP Range Validation', () => {
        const { isPrivateOrReservedIP, isAllowedPort, parseIPv4Mapped } = require('../src/core/tools/ReadWebPageTool');

        it('correctly classifies all private, loopback, CGNAT and cloud metadata IPv4 ranges', () => {
            assert.equal(isPrivateOrReservedIP('0.0.0.0'), true);
            assert.equal(isPrivateOrReservedIP('127.0.0.1'), true);
            assert.equal(isPrivateOrReservedIP('127.255.255.255'), true);
            assert.equal(isPrivateOrReservedIP('10.0.0.1'), true);
            assert.equal(isPrivateOrReservedIP('10.255.255.255'), true);
            assert.equal(isPrivateOrReservedIP('172.16.0.1'), true);
            assert.equal(isPrivateOrReservedIP('172.31.255.255'), true);
            assert.equal(isPrivateOrReservedIP('172.32.0.1'), false);
            assert.equal(isPrivateOrReservedIP('192.168.1.1'), true);
            assert.equal(isPrivateOrReservedIP('169.254.169.254'), true);
            assert.equal(isPrivateOrReservedIP('100.64.0.1'), true);
            assert.equal(isPrivateOrReservedIP('100.127.135.112'), true);
            assert.equal(isPrivateOrReservedIP('100.128.0.1'), false);
            assert.equal(isPrivateOrReservedIP('8.8.8.8'), false);
            assert.equal(isPrivateOrReservedIP('1.1.1.1'), false);
        });

        it('correctly classifies all IPv6 loopback, ULA, link-local and mapped ranges', () => {
            assert.equal(isPrivateOrReservedIP('::1'), true);
            assert.equal(isPrivateOrReservedIP('::'), true);
            assert.equal(isPrivateOrReservedIP('fc00::1'), true);
            assert.equal(isPrivateOrReservedIP('fd12:3456::1'), true);
            assert.equal(isPrivateOrReservedIP('fe80::1'), true);
            assert.equal(isPrivateOrReservedIP('::ffff:127.0.0.1'), true);
            assert.equal(isPrivateOrReservedIP('::ffff:7f00:1'), true);
            assert.equal(isPrivateOrReservedIP('::ffff:10.0.0.1'), true);
            assert.equal(isPrivateOrReservedIP('::ffff:8.8.8.8'), false);
            assert.equal(isPrivateOrReservedIP('2606:4700::'), false);
        });

        it('enforces Plan A Web port restrictions (80, 443, 8080, 8443)', () => {
            assert.equal(isAllowedPort(new URL('http://example.com')), true);
            assert.equal(isAllowedPort(new URL('https://example.com')), true);
            assert.equal(isAllowedPort(new URL('http://example.com:80')), true);
            assert.equal(isAllowedPort(new URL('https://example.com:443')), true);
            assert.equal(isAllowedPort(new URL('http://example.com:8080')), true);
            assert.equal(isAllowedPort(new URL('https://example.com:8443')), true);
            assert.equal(isAllowedPort(new URL('http://example.com:22')), false);
            assert.equal(isAllowedPort(new URL('http://example.com:25')), false);
            assert.equal(isAllowedPort(new URL('http://example.com:2000')), false);
            assert.equal(isAllowedPort(new URL('http://example.com:6379')), false);
        });

        it('blocks 302 redirect leading to private 127.0.0.1', async () => {
            const tool = new ReadWebPageTool();
            const originalFetch = globalThis.fetch;

            globalThis.fetch = async (url) => {
                if (String(url).includes('public-site.com')) {
                    return {
                        status: 302,
                        headers: new Headers({
                            location: 'http://127.0.0.1:8080/secret'
                        })
                    };
                }
                return { status: 200, ok: true, text: async () => 'secret data' };
            };

            try {
                const result = await tool.execute({ url: 'https://public-site.com/redirect' });
                assert.ok(result.includes('安全限制'));
                assert.ok(!result.includes('secret data'));
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('blocks open redirect chains exceeding 5 hops', async () => {
            const tool = new ReadWebPageTool();
            const originalFetch = globalThis.fetch;
            let hop = 0;

            globalThis.fetch = async () => {
                hop++;
                return {
                    status: 302,
                    headers: new Headers({
                        location: `https://example.com/hop-${hop}`
                    })
                };
            };

            try {
                const result = await tool.execute({ url: 'https://example.com/loop' });
                assert.ok(result.includes('超過最大重定向次數'));
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('blocks redirect attempting protocol smuggling to file:// or ftp://', async () => {
            const tool = new ReadWebPageTool();
            const originalFetch = globalThis.fetch;

            globalThis.fetch = async () => {
                return {
                    status: 302,
                    headers: new Headers({
                        location: 'file:///etc/passwd'
                    })
                };
            };

            try {
                const result = await tool.execute({ url: 'https://example.com/smuggle' });
                assert.ok(result.includes('安全限制') || result.includes('僅支援 HTTP 與 HTTPS'));
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
