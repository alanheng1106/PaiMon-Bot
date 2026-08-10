/**
 * Default domain configurations for social media embed fixing.
 */

const defaultDomains = [
    {
        id: 'twitter',
        name: 'Twitter / X',
        color: '#1DA1F2',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?twitter\.com\/[a-zA-Z0-9_]+\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?\S*/gi,
            /https?:\/\/(?:www\.)?x\.com\/[a-zA-Z0-9_]+\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxembed',
                name: 'FxEmbed',
                default: true,
                replacements: [
                    { old: 'twitter.com', new: 'fxtwitter.com' },
                    { old: 'x.com', new: 'fixupx.com' }
                ]
            },
            {
                id: 'bettertwitfix',
                name: 'BetterTwitFix',
                replacements: [
                    { old: 'twitter.com', new: 'vxtwitter.com' },
                    { old: 'x.com', new: 'fixvx.com' }
                ]
            },
            {
                id: 'embedez',
                name: 'EmbedEZ',
                replacements: [
                    { old: 'twitter.com', new: 'xeezz.com' },
                    { old: 'x.com', new: 'xeezz.com' }
                ]
            }
        ]
    },
    {
        id: 'pixiv',
        name: 'Pixiv',
        color: '#0096FA',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?pixiv\.net\/(?:[a-zA-Z]+\/)?artworks\/\d+\/?\S*/gi
        ],
        providers: [
            {
                id: 'phixiv',
                name: 'Phixiv',
                default: true,
                replacements: [
                    { old: 'pixiv.net', new: 'phixiv.net' }
                ]
            }
        ]
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        color: '#EE1D52',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?tiktok\.com\/(?:t\/\w+|@[\w.]+\/video\/\d+)\/?\S*/gi,
            /https?:\/\/vm\.tiktok\.com\/\w+\/?\S*/gi,
            /https?:\/\/vt\.tiktok\.com\/\w+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxtiktok',
                name: 'fxTikTok',
                default: true,
                replacements: [
                    { old: 'tiktok.com', new: 'tnktok.com' }
                ]
            },
            {
                id: 'embedez',
                name: 'EmbedEZ',
                replacements: [
                    { old: 'tiktok.com', new: 'tiktokez.com' }
                ]
            },
            {
                id: 'kktiktok',
                name: 'KKTikTok',
                replacements: [
                    { old: 'tiktok.com', new: 'kktiktok.com' }
                ]
            }
        ]
    },
    {
        id: 'reddit',
        name: 'Reddit',
        color: '#FF4500',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+\/[\w]+\/?\S*/gi,
            /https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/[\w]+\/s\/[\w]+\/?\S*/gi,
            /https?:\/\/(?:www\.|old\.)?reddit\.com\/user\/[\w]+\/comments\/[\w]+\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fixreddit',
                name: 'FixReddit',
                default: true,
                replacements: [
                    { old: 'reddit.com', new: 'fxreddit.seria.moe' }
                ]
            },
            {
                id: 'vxreddit',
                name: 'vxReddit',
                replacements: [
                    { old: 'reddit.com', new: 'vxreddit.com' }
                ]
            },
            {
                id: 'embedez',
                name: 'EmbedEZ',
                replacements: [
                    { old: 'reddit.com', new: 'redditez.com' }
                ]
            }
        ]
    },
    {
        id: 'instagram',
        name: 'Instagram',
        color: '#E1306C',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reels?)\/[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?instagram\.com\/share\/(?:p|reels?)\/[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?instagram\.com\/share\/[\w-]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'vxinstagram',
                name: 'vxinstagram',
                default: true,
                replacements: [
                    { old: 'instagram.com', new: 'fxig.seria.moe' }
                ]
            },
            {
                id: 'eeinstagram',
                name: 'InstaFix',
                replacements: [
                    { old: 'instagram.com', new: 'eeinstagram.com' }
                ]
            },
            {
                id: 'kkinstagram',
                name: 'KKInstagram',
                replacements: [
                    { old: 'instagram.com', new: 'kkinstagram.com' }
                ]
            },
            {
                id: 'ddinstagram',
                name: 'ddinstagram',
                replacements: [
                    { old: 'instagram.com', new: 'ddinstagram.com' }
                ]
            }
        ]
    },
    {
        id: 'furaffinity',
        name: 'FurAffinity',
        color: '#FAAF3A',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?furaffinity\.net\/view\/\d+\/?\S*/gi
        ],
        providers: [
            {
                id: 'xfuraffinity',
                name: 'xfuraffinity',
                default: true,
                replacements: [
                    { old: 'furaffinity.net', new: 'xfuraffinity.net' }
                ]
            },
            {
                id: 'fxraffinity',
                name: 'fxraffinity',
                replacements: [
                    { old: 'furaffinity.net', new: 'fxraffinity.net' }
                ]
            }
        ]
    },
    {
        id: 'twitch_clips',
        name: 'Twitch Clips',
        color: '#9146FF',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/m\.twitch\.tv\/clip\/[\w]+\/?\S*/gi,
            /https?:\/\/clips\.twitch\.tv\/[\w]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?twitch\.tv\/[\w]+\/clip\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxtwitch',
                name: 'fxtwitch',
                default: true,
                replacements: [
                    { old: 'clips.twitch.tv', new: 'fxtwitch.seria.moe/clip' },
                    { old: 'm.twitch.tv', new: 'fxtwitch.seria.moe' },
                    { old: 'twitch.tv', new: 'fxtwitch.seria.moe' }
                ]
            }
        ]
    },
    {
        id: 'iwara',
        name: 'Iwara',
        color: '#00A0E9',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?iwara\.tv\/video\/[\w]+\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxiwara',
                name: 'fxiwara',
                default: true,
                replacements: [
                    { old: 'iwara.tv', new: 'fxiwara.seria.moe' }
                ]
            }
        ]
    },
    {
        id: 'bluesky',
        name: 'Bluesky',
        color: '#1185FE',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?bsky\.app\/profile\/[\w.-]+\/post\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'vixbluesky',
                name: 'VixBluesky',
                default: true,
                replacements: [
                    { old: 'bsky.app', new: 'bskx.app' }
                ]
            },
            {
                id: 'fxembed',
                name: 'FxEmbed',
                replacements: [
                    { old: 'bsky.app', new: 'fxbsky.app' }
                ]
            }
        ]
    },
    {
        id: 'kemono',
        name: 'Kemono',
        color: '#FF5E5B',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?kemono\.su\/[a-zA-Z0-9_]+\/user\/[\w-]+\/post\/[\w-]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'kemono',
                name: 'Kemono',
                default: true,
                replacements: []
            }
        ]
    },
    {
        id: 'douyin',
        name: 'Douyin (抖音)',
        color: '#161823',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:v\.|www\.)?douyin\.com\/(?:video|note|share\/video)\/[\w-]+\/?\S*/gi,
            /https?:\/\/v\.douyin\.com\/[\w-]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'douyin',
                name: 'Douyin',
                default: true,
                replacements: []
            }
        ]
    },
    {
        id: 'facebook',
        name: 'Facebook',
        color: '#1877F2',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?facebook\.com\/share\/[rpv]\/[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?facebook\.com\/(?:reel|reels|watch)\/(?:\?v=)?[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?facebook\.com\/[\w.]+\/(?:posts|videos|photos)\/[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?facebook\.com\/groups\/[\w.]+\/permalink\/[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?facebook\.com\/story\.php\?\S+/gi,
            /https?:\/\/fb\.watch\/[\w-]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'facebed',
                name: 'facebed',
                default: true,
                replacements: [
                    { old: 'facebook.com', new: 'facebed.seria.moe' },
                    { old: 'fb.watch', new: 'facebed.seria.moe/watch' }
                ]
            },
            {
                id: 'embedez',
                name: 'EmbedEZ',
                replacements: [
                    { old: 'facebook.com', new: 'facebookez.com' },
                    { old: 'fb.watch', new: 'facebookez.com/watch' }
                ]
            }
        ]
    },
    {
        id: 'bilibili',
        name: 'Bilibili',
        color: '#00AEEC',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/[\w]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?b23\.tv\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxbilibili',
                name: 'fxbilibili',
                default: true,
                replacements: [
                    { old: 'm.bilibili.com', new: 'fxbilibili.seria.moe' },
                    { old: 'bilibili.com', new: 'fxbilibili.seria.moe' },
                    { old: 'b23.tv', new: 'fxbilibili.seria.moe/b23' }
                ]
            },
            {
                id: 'embedez',
                name: 'EmbedEZ',
                replacements: [
                    { old: 'bilibili.com', new: 'bilibiliz.com' }
                ]
            },
            {
                id: 'bilifix',
                name: 'BiliFix',
                replacements: [
                    { old: 'm.bilibili.com', new: 'vxbilibili.com' },
                    { old: 'bilibili.com', new: 'vxbilibili.com' },
                    { old: 'b23.tv', new: 'vxb23.tv' }
                ]
            }
        ]
    },
    {
        id: 'bilibili_opus',
        name: 'Bilibili Opus',
        color: '#00AEEC',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.|m\.)?bilibili\.com\/opus\/\d+\/?\S*/gi,
            /https?:\/\/t\.bilibili\.com\/\d+\/?\S*/gi
        ],
        providers: [
            {
                id: 'bilifix',
                name: 'BiliFix',
                default: true,
                replacements: [
                    { old: 'bilibili.com', new: 'vxbilibili.com' }
                ]
            }
        ]
    },
    {
        id: 'tumblr',
        name: 'Tumblr',
        color: '#36465D',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?tumblr\.com\/[a-zA-Z0-9_-]+\/[0-9]+\/?(?:[a-zA-Z0-9_-]+\/?)?\S*/gi
        ],
        providers: [
            {
                id: 'fxtumblr',
                name: 'fxtumblr',
                default: true,
                replacements: [
                    { old: 'tumblr.com', new: 'tpmblr.com' }
                ]
            }
        ]
    },
    {
        id: 'threads',
        name: 'Threads',
        color: '#000000',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@[\w.]+\/post\/[\w]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@[\w.]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?threads\.(?:net|com)\/share\/[\w]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fixthreads',
                name: 'FixThreads',
                default: true,
                replacements: [
                    { old: 'threads.net', new: 'fixthreads.seria.moe' },
                    { old: 'threads.com', new: 'fixthreads.seria.moe' }
                ]
            },
            {
                id: 'vxthreads',
                name: 'vxThreads',
                replacements: [
                    { old: 'threads.net', new: 'vxthreads.net' },
                    { old: 'threads.com', new: 'vxthreads.net' }
                ]
            }
        ]
    },
    {
        id: 'ptt',
        name: 'PTT',
        color: '#888888',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?ptt\.cc\/bbs\/[A-Za-z0-9_]+\/M\.\d+\.A\.[A-Z0-9]+\.html\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxptt',
                name: 'fxptt',
                default: true,
                replacements: [
                    { old: 'ptt.cc', new: 'fxptt.seria.moe' }
                ]
            }
        ]
    },
    {
        id: 'deviantart',
        name: 'DeviantArt',
        color: '#05CC47',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?deviantart\.com\/[\w.-]+\/art\/[\w.-]+-\d+\/?\S*/gi
        ],
        providers: [
            {
                id: 'fxdeviantart',
                name: 'fxdeviantart',
                default: true,
                replacements: [
                    { old: 'deviantart.com', new: 'fixdeviantart.com' }
                ]
            }
        ]
    },
    {
        id: 'pinterest',
        name: 'Pinterest',
        color: '#E60023',
        enabledByDefault: true,
        patterns: [
            /https?:\/\/(?:www\.)?pinterest\.com\/pin\/\d+\/?\S*/gi
        ],
        providers: [
            {
                id: 'embedez',
                name: 'EmbedEZ',
                default: true,
                replacements: [
                    { old: 'pinterest.com', new: 'pinterestez.com' }
                ]
            }
        ]
    },
    {
        id: 'youtube',
        name: 'YouTube',
        color: '#FF0000',
        enabledByDefault: false,
        patterns: [
            /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+\/?\S*/gi,
            /https?:\/\/(?:www\.)?youtu\.be\/[\w-]+\/?\S*/gi
        ],
        providers: [
            {
                id: 'koutube',
                name: 'Koutube',
                default: true,
                replacements: [
                    { old: 'youtube.com', new: 'koutube.com' },
                    { old: 'youtu.be', new: 'koutu.be' }
                ]
            }
        ]
    }
];

module.exports = defaultDomains;
