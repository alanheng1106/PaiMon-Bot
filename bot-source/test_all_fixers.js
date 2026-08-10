const LinkFixer = require('./src/core/LinkFixer');

const fixer = new LinkFixer();
const defaultSettings = {
    disabledDomains: [],
    domainProviders: {}
};

const testCases = [
    { name: 'Twitter / X', url: 'https://x.com/jack/status/20' },
    { name: 'Instagram Post', url: 'https://www.instagram.com/p/Cxxxxxx/' },
    { name: 'Instagram Reel', url: 'https://www.instagram.com/reel/Db00fhzoQbE/' },
    { name: 'TikTok', url: 'https://vt.tiktok.com/ZSNxxxxxx/' },
    { name: 'Douyin (抖音)', url: 'https://v.douyin.com/iLkXxxxxx/' },
    { name: 'Threads', url: 'https://www.threads.com/@ayuki_believe/post/Db1w8KqD0eV' },
    { name: 'Facebook Share Reel', url: 'https://www.facebook.com/share/r/123456789/' },
    { name: 'Facebook Share Post', url: 'https://www.facebook.com/share/p/123456789/' },
    { name: 'Facebook Watch', url: 'https://fb.watch/abcdef123/' },
    { name: 'Bilibili Video', url: 'https://www.bilibili.com/video/BV1xx411c7xx' },
    { name: 'Bilibili Opus', url: 'https://www.bilibili.com/opus/123456789' },
    { name: 'Reddit', url: 'https://www.reddit.com/r/memes/comments/12345/test/' },
    { name: 'Pixiv', url: 'https://www.pixiv.net/artworks/12345678' },
    { name: 'FurAffinity', url: 'https://www.furaffinity.net/view/12345678/' },
    { name: 'Twitch Clip', url: 'https://clips.twitch.tv/SampleClipId' },
    { name: 'Iwara', url: 'https://www.iwara.tv/video/123456/sample' },
    { name: 'Bluesky', url: 'https://bsky.app/profile/user.bsky.social/post/12345' },
    { name: 'Kemono', url: 'https://kemono.su/patreon/user/12345/post/67890' },
    { name: 'Tumblr', url: 'https://www.tumblr.com/user/123456789' },
    { name: 'PTT', url: 'https://www.ptt.cc/bbs/Gossiping/M.12345.A.123.html' },
    { name: 'DeviantArt', url: 'https://www.deviantart.com/artist/art/Sample-Title-12345' },
    { name: 'Pinterest', url: 'https://www.pinterest.com/pin/123456789/' }
];

async function runTestSuite() {
    console.log('=============== 🧪 PaiMon-Bot LinkFixer 全平台全面測試套件 ===============\n');
    let total = testCases.length;
    let passedRegex = 0;
    let passedLiveFetch = 0;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        console.log(`[${i + 1}/${total}] 測試 ${tc.name}: ${tc.url}`);

        const { fixedLinks, items } = await fixer.process(tc.url, defaultSettings);

        if (fixedLinks.length === 0 || items.length === 0) {
            console.log(`  ❌ 正則匹配/轉譯失敗!\n`);
            continue;
        }

        passedRegex++;
        const item = items[0];
        console.log(`  ✅ 正則轉譯成功 -> ${item.fixedUrl}`);

        const og = await fixer.fetchOGMetadata(item.fixedUrl);
        if (og) {
            console.log(`  📡 OpenGraph 擷取狀態: HTTP OK`);
            console.log(`     ├─ 標題 (Title): ${og.title || '(無)'}`);
            console.log(`     ├─ 正文 (Desc): ${og.description ? og.description.slice(0, 50) + '...' : '(無)'}`);
            console.log(`     ├─ 圖片 (Image): ${og.image || '(無)'}`);
            console.log(`     └─ 影片 (Video): ${og.video || '(無)'}`);
            passedLiveFetch++;
        } else {
            console.log(`  ⚠️ OpenGraph 擷取狀態: 網路/服務無回應`);
        }
        console.log('');
    }

    console.log('==========================================================================');
    console.log(`📊 測試結果總結:`);
    console.log(`   - 平台匹配轉譯成功率: ${passedRegex} / ${total} (${((passedRegex / total) * 100).toFixed(1)}%)`);
    console.log(`   - 即時中繼資料擷取數: ${passedLiveFetch} / ${total}`);
    console.log('==========================================================================\n');
}

runTestSuite();
