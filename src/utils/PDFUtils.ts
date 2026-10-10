import { extractText, renderPageAsImage, definePDFJSModule } from 'unpdf';

// Initialize unpdf with official pdfjs-dist legacy build (includes pure JS Jbig2Image, JpxImage decoders)
await definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs')).catch((err) =>
    console.warn('[PDFUtils] Failed to define official PDFJS module:', err.message)
);

export interface PDFExtractResult {
    totalPages: number;
    text: string;
    pages: string[];
    isEmpty: boolean;
}

export interface PDFExtractOptions {
    /** Maximum characters to return before truncating. Default: 500,000. */
    maxChars?: number;
    /** Whether to include page markers like "--- 第 X 頁 ---" when totalPages > 1. Default: true. */
    includePageMarkers?: boolean;
}

export interface PDFRenderOptions {
    /** Maximum pages to render into images. Default: 6. */
    maxPages?: number;
    /** Rendering resolution scale. Default: 1.5 (high DPI for OCR). */
    scale?: number;
}

/**
 * Checks if a given attachment or URL target is a PDF based on content-type or filename/URL.
 */
export function isPdf(contentType?: string | null, filename?: string | null): boolean {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('application/pdf')) return true;

    const fn = (filename || '').toLowerCase();
    const cleanFn = fn.split('?')[0].split('#')[0];
    return cleanFn.endsWith('.pdf');
}

/**
 * Extracts plain text from a PDF Buffer, Uint8Array, or ArrayBuffer.
 * Defensive copy prevents buffer detachment issues with underlying pdf.js runtime.
 */
export async function extractTextFromPDF(
    data: ArrayBuffer | Uint8Array | Buffer,
    options: PDFExtractOptions = {}
): Promise<PDFExtractResult> {
    const { maxChars = 500000, includePageMarkers = true } = options;

    if (!data) {
        return { totalPages: 0, text: '', pages: [], isEmpty: true };
    }

    // Defensive copy: create independent Uint8Array with sliced buffer to prevent detachment
    const bytes =
        data instanceof Uint8Array
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
            : new Uint8Array(data).slice();

    const result = await extractText(new Uint8Array(bytes.slice()));
    const totalPages = result.totalPages || 0;
    const rawPages: string[] = Array.isArray(result.text) ? result.text : [result.text || ''];

    const pages = rawPages.map((pageText) => (pageText || '').trim());
    const nonEmptyPages = pages.filter((p) => p.length > 0);
    const isEmpty = nonEmptyPages.length === 0;

    let formattedText = '';
    if (!isEmpty) {
        if (includePageMarkers && totalPages > 1) {
            formattedText = pages
                .map((p, idx) =>
                    p.length > 0 ? `--- 第 ${idx + 1} 頁 ---\n${p}` : `--- 第 ${idx + 1} 頁 ---\n(空白或無文字)`
                )
                .join('\n\n');
        } else {
            formattedText = pages.filter(Boolean).join('\n\n');
        }

        if (maxChars && formattedText.length > maxChars) {
            formattedText =
                formattedText.slice(0, maxChars) + '\n\n...[PDF 內容過長，已截斷剩餘內容]...';
        }
    }

    return {
        totalPages,
        text: formattedText,
        pages,
        isEmpty
    };
}

/**
 * Renders pages of a PDF into Base64-encoded PNG image data URIs (`data:image/png;base64,...`).
 * Used as fallback for scanned or photo-only PDFs so Vision LLMs can OCR and analyze them visually.
 */
export async function renderPDFPagesAsImages(
    data: ArrayBuffer | Uint8Array | Buffer,
    options: PDFRenderOptions = {}
): Promise<string[]> {
    const { maxPages = 6, scale = 1.5 } = options;
    if (!data) return [];

    const originalBytes =
        data instanceof Uint8Array
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
            : new Uint8Array(data as ArrayBuffer).slice();

    const images: string[] = [];
    try {
        const { totalPages } = await extractText(new Uint8Array(originalBytes.slice()));
        const pagesToRender = Math.min(totalPages, maxPages);

        for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
            try {
                const imgBuffer = await renderPageAsImage(new Uint8Array(originalBytes.slice()), pageNum, {
                    scale,
                    canvasImport: () => import('@napi-rs/canvas')
                });
                const base64 = Buffer.from(imgBuffer).toString('base64');
                images.push(`data:image/png;base64,${base64}`);
            } catch (err: any) {
                console.warn(`[PDFUtils] Failed to render page ${pageNum} as image:`, err.message);
            }
        }
    } catch (err: any) {
        console.warn('[PDFUtils] Failed to process PDF for image rendering:', err.message);
    }

    return images;
}
