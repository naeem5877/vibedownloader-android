/**
 * YouTubeMusicService
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the real album art for a YouTube Music track using three methods,
 * mirroring the Python reference script — but in pure TypeScript / fetch API.
 *
 * Priority:
 *   1. YouTube Music internal /youtubei/v1/next API  → lh3.googleusercontent.com
 *      This is the only source that returns true album art (not video thumbnails).
 *   2. YouTube Music page scrape                     → lh3.googleusercontent.com
 *   3. i.ytimg.com fallback                          → standard video thumbnail
 *
 * Usage:
 *   const art = await YouTubeMusicService.getAlbumArt('music.youtube.com/watch?v=xxxxx');
 *   // Returns a max-res URL string, or null if all methods fail.
 */

const YT_MUSIC_BASE  = 'https://music.youtube.com';
const NEXT_ENDPOINT  = `${YT_MUSIC_BASE}/youtubei/v1/next?prettyPrint=false`;

// Desktop UA used for every request — must match exactly what the browser sends
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts the 11-character YouTube video ID from any YouTube / YT Music URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
    const patterns = [
        /(?:music\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

/**
 * Returns true if the URL is a YouTube Music URL (music.youtube.com).
 */
export function isYouTubeMusicUrl(url: string): boolean {
    return url.includes('music.youtube.com');
}

/**
 * Returns true if the URL is any YouTube URL (youtube.com, youtu.be, music.youtube.com).
 */
export function isYouTubeUrl(url: string): boolean {
    return Boolean(extractYouTubeVideoId(url));
}

/**
 * Given a raw JSON string (or any text body), extracts all
 * lh3/yt3.googleusercontent.com URLs and returns the one with the largest
 * declared width (=wNNN) — i.e., the best album art.
 */
function extractBestLh3Url(raw: string): string | null {
    // The JSON escapes slashes as \/ — unescape so URL matching works
    const unescaped = raw.replace(/\\\//g, '/');
    // Match both lh3 (older API) and yt3 (current YT Music API) subdomains
    const found = unescaped.match(/https?:\/\/(?:lh3|yt3)\.googleusercontent\.com\/[^"\\]+/g);
    if (!found || found.length === 0) return null;

    const unique = Array.from(new Set(found));

    // Pick the URL that advertises the largest width
    const sizeHint = (u: string): number => {
        const m = u.match(/=w(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    };

    return unique.reduce((best, u) => sizeHint(u) >= sizeHint(best) ? u : best, unique[0]);
}

/**
 * Upgrades a googleusercontent.com URL to maximum resolution JPEG.
 * Matches desktop rewriteArtUrl: replaces size suffix with =w2000-h2000-p-l90-rj.
 */
export function upgradeToMaxRes(url: string): string {
    if (url.includes('=w')) {
        return url.replace(/=w\d+.*$/, '=w2000-h2000-p-l90-rj');
    }
    if (!url.includes('=')) {
        return `${url}=w2000-h2000-p-l90-rj`;
    }
    return url;
}

// ─── Method 1: YouTube Music internal /next API ────────────────────────────

async function getAlbumArtFromApi(videoId: string): Promise<string | null> {
    try {
        const payload = {
            videoId,
            context: {
                client: {
                    clientName:    'WEB_REMIX',
                    clientVersion: '1.20240101.01.00',
                    hl: 'en',
                    gl: 'US',
                },
            },
        };

        const res = await fetch(NEXT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type':              'application/json',
                'User-Agent':                UA,
                'Origin':                    YT_MUSIC_BASE,
                'Referer':                   `${YT_MUSIC_BASE}/watch?v=${videoId}`,
                'X-YouTube-Client-Name':     '67',
                'X-YouTube-Client-Version':  '1.20240101.01.00',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.warn(`[YTMusicService] API returned ${res.status}`);
            return null;
        }

        const text = await res.text();
        const best = extractBestLh3Url(text);
        if (best) {
            console.log(`[YTMusicService] ✅ Method 1 (API) found album art`);
            return upgradeToMaxRes(best);
        }
    } catch (e) {
        console.warn('[YTMusicService] Method 1 (API) failed:', e);
    }
    return null;
}

// ─── Method 2: YouTube Music page scrape ──────────────────────────────────

async function getAlbumArtFromPage(videoId: string): Promise<string | null> {
    try {
        const res = await fetch(`${YT_MUSIC_BASE}/watch?v=${videoId}`, {
            headers: {
                'User-Agent':      UA,
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie':          'CONSENT=YES+; SOCS=CAI',
            },
        });

        if (!res.ok) return null;

        const text = await res.text();
        const best = extractBestLh3Url(text);
        if (best) {
            console.log(`[YTMusicService] ✅ Method 2 (page scrape) found album art`);
            return upgradeToMaxRes(best);
        }
    } catch (e) {
        console.warn('[YTMusicService] Method 2 (page scrape) failed:', e);
    }
    return null;
}

// ─── Method 3: i.ytimg.com fallback ───────────────────────────────────────

async function getAlbumArtFallback(videoId: string): Promise<string | null> {
    const qualities = ['maxresdefault', 'sddefault', 'hqdefault'];
    for (const q of qualities) {
        const candidate = `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
        try {
            const res = await fetch(candidate, { method: 'HEAD' });
            if (res.ok) {
                console.log(`[YTMusicService] ⚠️  Method 3 (ytimg fallback): ${q}`);
                return candidate;
            }
        } catch (_) {}
    }
    return null;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface YTMusicAlbumArt {
    /** High-res album art URL (lh3 max-res or ytimg fallback) */
    url: string;
    /** true = real album art from YouTube Music API/page; false = video thumbnail fallback */
    isRealAlbumArt: boolean;
    /** The 11-char video ID that was used */
    videoId: string;
}

/**
 * Fetches the highest-quality album art for a YouTube Music URL.
 * Uses Promise.any to run three different fetch methods in parallel for maximum speed.
 *
 * @param ytMusicUrl  Full music.youtube.com/watch?v=... URL
 * @returns  YTMusicAlbumArt on success, null if all methods fail
 */
export async function getYouTubeMusicAlbumArt(
    ytMusicUrl: string
): Promise<YTMusicAlbumArt | null> {
    const videoId = extractYouTubeVideoId(ytMusicUrl);
    if (!videoId) {
        console.warn('[YTMusicService] Could not extract video ID from:', ytMusicUrl);
        return null;
    }

    console.log(`[YTMusicService] Fetching real album art for video ID: ${videoId}`);

    try {
        // Run Method 1 (API) and Method 2 (page scrape) in parallel for true square album art
        const realArtUrl = await Promise.any([
            getAlbumArtFromApi(videoId),
            getAlbumArtFromPage(videoId),
        ].map(p => p.then(url => {
            if (!url) throw new Error('No real album art found');
            return url;
        })));

        if (realArtUrl) {
            console.log(`[YTMusicService] 🌟 Got true album art: ${realArtUrl}`);
            return { url: realArtUrl, isRealAlbumArt: true, videoId };
        }
    } catch (_) {
        // True art methods failed, fall through to video thumbnail fallback
    }

    try {
        const fallbackUrl = await getAlbumArtFallback(videoId);
        if (fallbackUrl) {
            // Explicitly not real album art: this is the video thumbnail, so the
            // caller is told the truth rather than embedding a still frame from
            // the music video and calling it cover art.
            return { url: fallbackUrl, isRealAlbumArt: false, videoId };
        }
    } catch (_) {}

    console.warn(`[YTMusicService] ❌ All methods failed for ${videoId}`);
    return null;
}
