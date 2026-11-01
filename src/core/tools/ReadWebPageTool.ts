import dns from 'node:dns/promises';
import net from 'node:net';
import BaseTool, { ToolDefinition } from './BaseTool';
import { Emojis } from '../../config';
import { isPdf, extractTextFromPDF } from '../../utils/PDFUtils';

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Parses IPv4-mapped IPv6 address (::ffff:x.x.x.x or ::ffff:hhhh:hhhh) into dotted IPv4.
 */
export function parseIPv4Mapped(ip: string): string | null {
    const raw = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
    if (!raw.startsWith('::ffff:')) return null;

    const rest = raw.slice(7);
    if (rest.includes('.')) {
        return rest;
    }

    const parts = rest.split(':');
    if (parts.length === 2) {
        const high = parseInt(parts[0], 16);
        const low = parseInt(parts[1], 16);
        if (!isNaN(high) && !isNaN(low)) {
            const b1 = (high >> 8) & 0xff;
            const b2 = high & 0xff;
            const b3 = (low >> 8) & 0xff;
            const b4 = low & 0xff;
            return `${b1}.${b2}.${b3}.${b4}`;
        }
    }
    return null;
}

/**
 * Checks whether an IP address belongs to private, loopback, link-local, CGNAT, or reserved ranges.
 */
export function isPrivateOrReservedIP(ipStr: string): boolean {
    const ip = ipStr.replace(/^\[|\]$/g, '').trim().toLowerCase();

    // 1. IPv4-mapped IPv6 (::ffff:0:0/96)
    if (ip.startsWith('::ffff:')) {
        const mappedIPv4 = parseIPv4Mapped(ip);
        if (mappedIPv4) {
            return isPrivateOrReservedIP(mappedIPv4);
        }
        return true;
    }

    // 2. IPv4
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
            return true;
        }

        // 0.0.0.0/8 (Current network / "this" host)
        if (parts[0] === 0) return true;
        // 10.0.0.0/8 (Private network)
        if (parts[0] === 10) return true;
        // 100.64.0.0/10 (CGNAT / Shared Address Space / Tailscale)
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        // 127.0.0.0/8 (Loopback)
        if (parts[0] === 127) return true;
        // 169.254.0.0/16 (Link-Local, AWS/Cloud metadata 169.254.169.254)
        if (parts[0] === 169 && parts[1] === 254) return true;
        // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        // 192.168.0.0/16 (Private network)
        if (parts[0] === 192 && parts[1] === 168) return true;
        // Documentation & benchmark ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 198.18.0.0/15)
        if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
        if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
        if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
        if (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) return true;
        // 224.0.0.0/4 (Multicast), 240.0.0.0/4 (Reserved), 255.255.255.255 (Broadcast)
        if (parts[0] >= 224) return true;

        return false;
    }

    // 3. IPv6
    if (net.isIPv6(ip)) {
        // :: (unspecified) and ::1 (loopback)
        if (ip === '::' || ip === '::1' || /^0*(:0*)*:?1?$/.test(ip)) return true;

        // fc00::/7 (Unique Local Address - ULA, private)
        if (/^f[cd][0-9a-f]{0,2}:/i.test(ip)) return true;

        // fe80::/10 (Link-Local)
        if (/^fe[89ab][0-9a-f]{0,1}:/i.test(ip)) return true;

        // ff00::/8 (Multicast)
        if (/^ff[0-9a-f]{0,2}:/i.test(ip)) return true;

        // 2001:db8::/32 (Documentation)
        if (/^2001:db8:/i.test(ip)) return true;

        return false;
    }

    return true; // Non-standard or unparseable IP format
}

/**
 * Validates port against strict Web port whitelist (80, 443, 8080, 8443).
 */
export function isAllowedPort(parsedUrl: URL): boolean {
    const port = parsedUrl.port
        ? parseInt(parsedUrl.port, 10)
        : parsedUrl.protocol === 'https:'
          ? 443
          : 80;
    return ALLOWED_PORTS.has(port);
}

/**
 * Validates a single hop URL against SSRF attack vectors.
 */
export async function validateUrlForSSRF(url: URL): Promise<string | null> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return `安全限制: 僅支援 HTTP 與 HTTPS 協定的網址 (收到 ${url.protocol})。`;
    }

    if (!isAllowedPort(url)) {
        const portStr = url.port || (url.protocol === 'https:' ? '443' : '80');
        return `安全限制: 連接埠 ${portStr} 受限，僅支援標準 Web 連接埠 (80, 443, 8080, 8443)。`;
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

    // 1. Literal IP address
    if (net.isIP(hostname)) {
        if (isPrivateOrReservedIP(hostname)) {
            return '安全限制: 無法存取本機、內網或私有保留網路 IP 位址。';
        }
        return null;
    }

    // 2. Localhost & local domain naming
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        return '安全限制: 無法存取本機或本地域名。';
    }

    // 3. DNS resolution validation
    try {
        const addresses = await dns.lookup(hostname, { all: true });
        if (!addresses || addresses.length === 0) {
            return `無法解析網域名稱主機位址: "${hostname}"`;
        }
        for (const addr of addresses) {
            if (isPrivateOrReservedIP(addr.address)) {
                return `安全限制: 網域名稱 "${hostname}" 解析至內部私有網路 IP (${addr.address})，拒絕連線。`;
            }
        }
    } catch (dnsErr: any) {
        return `DNS 解析失敗: ${dnsErr.message} (${hostname})`;
    }

    return null;
}

/**
 * Safely reads response body with size limit to prevent memory exhaustion (OOM).
 */
async function readResponseBody(
    response: Response,
    maxBytes: number
): Promise<{ buffer: ArrayBuffer; isTooLarge: boolean }> {
    const cl = response.headers.get('content-length');
    if (cl) {
        const length = parseInt(cl, 10);
        if (!isNaN(length) && length > maxBytes) {
            return { buffer: new ArrayBuffer(0), isTooLarge: true };
        }
    }

    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    totalBytes += value.length;
                    if (totalBytes > maxBytes) {
                        await reader.cancel().catch(() => {});
                        return { buffer: new ArrayBuffer(0), isTooLarge: true };
                    }
                    chunks.push(value);
                }
            }
        } catch {
            return { buffer: new ArrayBuffer(0), isTooLarge: false };
        }

        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        return { buffer: merged.buffer, isTooLarge: false };
    }

    // Fallback if response.body is not a ReadableStream (e.g. mocked response in tests)
    if (typeof response.arrayBuffer === 'function') {
        const buf = await response.arrayBuffer();
        if (buf.byteLength > maxBytes) {
            return { buffer: new ArrayBuffer(0), isTooLarge: true };
        }
        return { buffer: buf, isTooLarge: false };
    }

    if (typeof response.text === 'function') {
        const text = await response.text();
        const buf = Buffer.from(text, 'utf8');
        if (buf.byteLength > maxBytes) {
            return { buffer: new ArrayBuffer(0), isTooLarge: true };
        }
        return { buffer: buf.buffer, isTooLarge: false };
    }

    return { buffer: new ArrayBuffer(0), isTooLarge: false };
}

/**
 * ReadWebPageTool — Tool strategy for reading and extracting clean text from webpage URLs and PDF documents.
 * Hardened against SSRF, open redirect chains, DNS rebinding, oversized payload bombs, and port scanning.
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

        if (context?.onUpdate) {
            context.onUpdate(`${Emojis.Loading} *(正在讀取網頁: ${parsedUrl.hostname}...)*`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            let currentUrl = parsedUrl;
            let redirectCount = 0;
            let response: Response | null = null;

            while (true) {
                const ssrfError = await validateUrlForSSRF(currentUrl);
                if (ssrfError) {
                    return ssrfError;
                }

                const res = await fetch(currentUrl.toString(), {
                    method: 'GET',
                    signal: controller.signal,
                    redirect: 'manual',
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/pdf;q=0.8,*/*;q=0.5'
                    }
                });

                if ([301, 302, 303, 307, 308].includes(res.status)) {
                    redirectCount++;
                    if (redirectCount > MAX_REDIRECTS) {
                        return `安全限制: 超過最大重定向次數 (${MAX_REDIRECTS} 次): ${trimmedUrl}`;
                    }

                    const location = res.headers.get('location');
                    if (!location) {
                        return `重定向錯誤 (HTTP ${res.status}): 伺服器未提供 Location 標頭。`;
                    }

                    try {
                        currentUrl = new URL(location, currentUrl);
                    } catch {
                        return `無效的重定向網址: "${location}"`;
                    }
                    continue;
                }

                response = res;
                break;
            }

            if (!response.ok) {
                return `無法載入網頁 (HTTP ${response.status} ${response.statusText}): ${trimmedUrl}`;
            }

            const contentType = response.headers.get('content-type') || '';
            const isPdfDocument = isPdf(contentType, currentUrl.pathname);

            if (isPdfDocument) {
                if (context?.onUpdate) {
                    context.onUpdate(`${Emojis.Loading} *(正在下載並解析 PDF 文件: ${currentUrl.hostname}...)*`);
                }

                const { buffer, isTooLarge } = await readResponseBody(response, MAX_PDF_BYTES);
                if (isTooLarge) {
                    return `檔案大小超過安全限制 (最大 ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB): ${trimmedUrl}`;
                }

                try {
                    const { text: pdfText, totalPages, isEmpty } = await extractTextFromPDF(buffer, {
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

            const { buffer, isTooLarge } = await readResponseBody(response, MAX_TEXT_BYTES);
            if (isTooLarge) {
                return `網頁大小超過安全限制 (最大 ${Math.round(MAX_TEXT_BYTES / (1024 * 1024))} MB): ${trimmedUrl}`;
            }

            const html = Buffer.from(buffer).toString('utf-8');
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
