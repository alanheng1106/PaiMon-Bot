import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import LinkFixer from '../src/core/LinkFixer';
import LinkFixHandler from '../src/handlers/LinkFixHandler';
import BaseMetadataScraper from '../src/core/scrapers/BaseMetadataScraper';

class TestBoundedScraper extends BaseMetadataScraper {
    async readHtml(res, maxBytes) {
        return this.readBoundedHtml(res, maxBytes);
    }
}

describe('LinkFixer & LinkFixHandler', () => {
    it('rewrites social media links and fetches metadata via LinkFixHandler', async () => {
        const fixer = new LinkFixer();
        fixer.registerScraper({
            canHandle: () => true,
            scrape: async () => ({
                title: 'Test Tweet',
                description: 'Hello from Twitter',
                image: 'https://example.com/image.png',
                siteName: 'TwitterUser'
            })
        });

        let embedsSuppressed = false;
        let repliedPayload = null;

        const mockMessage = {
            guild: { id: 'g-1' },
            channel: { id: 'c-1' },
            author: { id: 'u-1', bot: false },
            content: 'Check this out https://x.com/user/status/1234567890',
            suppressEmbeds: async (val) => {
                embedsSuppressed = val;
            },
            reply: async (payload) => {
                repliedPayload = payload;
                return { id: 'sent-1' };
            }
        };

        const mockBot = {
            linkFixer: fixer
        };

        const handler = new LinkFixHandler();
        const handled = await handler.handle(mockMessage, mockBot);

        assert.equal(handled, true);
        assert.equal(embedsSuppressed, true);
        assert.ok(repliedPayload);
        assert.equal(repliedPayload.components.length, 1);
    });

    it('skips replying when scraped metadata has no content', async () => {
        const fixer = new LinkFixer();
        fixer.registerScraper({
            canHandle: () => true,
            scrape: async () => null
        });

        let replied = false;
        const mockMessage = {
            guild: { id: 'g-1' },
            content: 'https://twitter.com/user/status/1234567890',
            suppressEmbeds: async () => {},
            reply: async () => {
                replied = true;
            }
        };

        const handler = new LinkFixHandler();
        const handled = await handler.handle(mockMessage, { linkFixer: fixer });

        assert.equal(handled, false);
        assert.equal(replied, false);
    });

    it('readBoundedHtml rejects non-HTML content-type and caps streaming HTML at maxBytes', async () => {
        const scraper = new TestBoundedScraper();

        // 1. Reject binary / non-HTML response
        const videoRes = new Response('binary-video-data', {
            headers: { 'content-type': 'video/mp4' }
        });
        assert.equal(await scraper.readHtml(videoRes, 100), null);

        // 2. Cap multi-chunk stream at maxBytes and cancel reader
        let cancelled = false;
        let pulls = 0;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            pull(controller) {
                pulls++;
                if (pulls === 1) {
                    controller.enqueue(encoder.encode('<html><head><title>Hello</title>'));
                } else {
                    controller.enqueue(encoder.encode('</head><body>' + 'A'.repeat(200) + '</body></html>'));
                }
            },
            cancel() {
                cancelled = true;
            }
        });

        const htmlRes = new Response(stream, {
            headers: { 'content-type': 'text/html; charset=utf-8' }
        });
        const bounded = await scraper.readHtml(htmlRes, 50);
        assert.equal(bounded.length, 50);
        assert.ok(bounded.startsWith('<html><head><title>Hello</title>'));
        assert.equal(cancelled, true);
    });
});
