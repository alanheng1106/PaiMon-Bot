import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPdf, extractTextFromPDF, renderPDFPagesAsImages } from '../src/utils/PDFUtils';
import { buildPdfWithPages } from './pdfTestHelper.js';

describe('PDFUtils', () => {
    describe('isPdf', () => {
        it('identifies PDF by application/pdf MIME type', () => {
            assert.equal(isPdf('application/pdf', 'file.bin'), true);
            assert.equal(isPdf('APPLICATION/PDF; charset=utf-8', 'report'), true);
        });

        it('identifies PDF by filename extension', () => {
            assert.equal(isPdf('application/octet-stream', 'manual.pdf'), true);
            assert.equal(isPdf(null, 'document.PDF'), true);
            assert.equal(isPdf(undefined, 'https://example.com/doc.pdf?dl=1#page=1'), true);
        });

        it('returns false for non-PDF content and files', () => {
            assert.equal(isPdf('text/plain', 'notes.txt'), false);
            assert.equal(isPdf('image/png', 'image.png'), false);
            assert.equal(isPdf(null, 'source.py'), false);
            assert.equal(isPdf(null, null), false);
        });
    });

    describe('extractTextFromPDF', () => {
        it('extracts readable text from single-page PDF', async () => {
            const buf = buildPdfWithPages(['Hello Paimon PDF']);
            const result = await extractTextFromPDF(buf);

            assert.equal(result.totalPages, 1);
            assert.equal(result.isEmpty, false);
            assert.ok(result.text.includes('Hello Paimon PDF'));
        });

        it('extracts and formats multi-page PDF with page markers', async () => {
            const buf = buildPdfWithPages(['First Page Content', 'Second Page Content']);
            const result = await extractTextFromPDF(buf);

            assert.equal(result.totalPages, 2);
            assert.equal(result.isEmpty, false);
            assert.ok(result.text.includes('--- 第 1 頁 ---'));
            assert.ok(result.text.includes('First Page Content'));
            assert.ok(result.text.includes('--- 第 2 頁 ---'));
            assert.ok(result.text.includes('Second Page Content'));
        });

        it('handles empty input gracefully', async () => {
            const result = await extractTextFromPDF(null);
            assert.equal(result.totalPages, 0);
            assert.equal(result.isEmpty, true);
            assert.equal(result.text, '');
        });

        it('flags PDF with no text as isEmpty', async () => {
            const buf = buildPdfWithPages(['']);
            const result = await extractTextFromPDF(buf);
            assert.equal(result.totalPages, 1);
            assert.equal(result.isEmpty, true);
            assert.equal(result.text, '');
        });

        it('truncates text when maxChars is exceeded', async () => {
            const buf = buildPdfWithPages(['A long sentence that should get truncated properly.']);
            const result = await extractTextFromPDF(buf, { maxChars: 15 });

            assert.ok(result.text.includes('...[PDF 內容過長，已截斷剩餘內容]...'));
        });
    });

    describe('renderPDFPagesAsImages', () => {
        it('renders PDF pages into Base64-encoded PNG image data URIs', async () => {
            const buf = buildPdfWithPages(['Page 1 Image Test', 'Page 2 Image Test']);
            const images = await renderPDFPagesAsImages(buf, { maxPages: 2 });

            assert.equal(images.length, 2);
            assert.ok(images[0].startsWith('data:image/png;base64,'));
            assert.ok(images[1].startsWith('data:image/png;base64,'));
        });

        it('handles null/empty input gracefully', async () => {
            const images = await renderPDFPagesAsImages(null);
            assert.deepEqual(images, []);
        });

        it('respects maxPages limit', async () => {
            const buf = buildPdfWithPages(['P1', 'P2', 'P3']);
            const images = await renderPDFPagesAsImages(buf, { maxPages: 1 });
            assert.equal(images.length, 1);
        });
    });
});
