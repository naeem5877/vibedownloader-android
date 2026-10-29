/**
 * YouTubePlaylistService
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads YouTube / YouTube Music playlists and mixes straight from InnerTube,
 * with no Python or yt-dlp involved. That makes it several times faster than
 * `yt-dlp --flat-playlist` and, unlike yt-dlp, it can page through "Mix"
 * (RD…) playlists, which are infinite and have no fixed length.
 *
 * Loaders, tried in this order depending on the list id:
 *
 *   • Music playlist   POST music.youtube.com/youtubei/v1/browse (WEB_REMIX)
 *       Fixed lists: PL…, OLAK5uy_…, RDCLAK…, RDTMAK…, UU… and the user's own
 *       YT Music playlists. Gives exactly what the YT Music app shows: the real
 *       cover (a mosaic for user playlists), square album art per song,
 *       artist names instead of channel names, and a marker for tracks that
 *       are greyed out as unavailable.
 *
 *   • Web playlist     POST www.youtube.com/youtubei/v1/browse (WEB)
 *       Same lists through the regular site (lockupViewModel rows). Used when
 *       the music endpoint has nothing to say.
 *
 *   • Mix              POST music.youtube.com/youtubei/v1/next (WEB_REMIX)
 *       RD<seed>, RDAMVM<seed>, RDEM…, … Infinite radios: ≈50 tracks per page,
 *       continued through `nextRadioContinuationData`. Pages overlap, so ids
 *       are de-duplicated and paging stops once pages stop adding anything.
 *       The `v=` of a link need not match the seed: that video simply leads.
 *
 * Personal lists (Watch Later WL, Liked LL/LM, "Mixed for you" RDTMAK…, the
 * user's private playlists) do not exist for an anonymous caller. When a cookie
 * header is supplied, requests are signed the same way the web client signs
 * them (SAPISIDHASH) so these lists load too. Without cookies they reject with
 * `AUTH` / `EMPTY` and the caller decides what to tell the user.
 *
 * Tracks that cannot be played or downloaded (deleted, private, greyed out,
 * region-blocked) are dropped and counted in `unavailableCount`.
 *
 * Nothing here throws for "soft" problems on later pages: if page 1 worked and
 * page N fails, the items already collected are returned.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface YouTubePlaylistItem {
    id: string;
    title: string;
    /** Artist(s) for music, channel name otherwise. */
    author: string;
    /** "3:34" style, undefined for live streams / unknown. */
    duration?: string;
    /** Square album art when YouTube Music has it, otherwise a 16:9 frame. */
    thumbnail?: string;
    /** Single-video URL (never carries `list=`, so a download stays one video). */
    url: string;
    type: 'youtube';
}

export type YouTubePlaylistKind = 'playlist' | 'mix';

export interface YouTubePlaylistResult {
    title: string;
    /**
     * Cover image. Undefined for mixes and for lists with no cover of their
     * own: the UI then builds a collage from the first tracks' art.
     */
    thumbnail?: string;
    /** e.g. "52 songs • 3 hours, 23 minutes" or "Mix • 100 tracks". */
    subtitle: string;
    kind: YouTubePlaylistKind;
    items: YouTubePlaylistItem[];
    /** Total reported by YouTube for fixed-length playlists. */
    totalCount?: number;
    /** True when the item cap stopped us before the end of the list. */
    truncated: boolean;
    /** Tracks left out because they cannot be played / downloaded. */
    unavailableCount: number;
    /** True when the list was only readable because the user is signed in. */
    usedLogin: boolean;
}

export interface ParsedYouTubePlaylistUrl {
    listId: string;
    /** 11-char id from `v=` or youtu.be/<id>, when the link has one. */
    videoId: string | null;
    kind: YouTubePlaylistKind;
    isMusicHost: boolean;
    /** Watch Later / Liked / Library lists: only reachable when logged in. */
    requiresAuth: boolean;
}

export type YouTubePlaylistErrorCode =
    | 'NOT_PLAYLIST'
    | 'AUTH'
    | 'EMPTY'
    | 'NETWORK'
    | 'PARSE';

export class YouTubePlaylistError extends Error {
    code: YouTubePlaylistErrorCode;
    constructor(code: YouTubePlaylistErrorCode, message: string) {
        super(message);
        this.name = 'YouTubePlaylistError';
        this.code = code;
    }
}

export interface FetchYouTubePlaylistOptions {
    /** Abort to stop paging, e.g. when the user closes the sheet. */
    signal?: AbortSignal;
    /** Called with a snapshot after every page. */
    onProgress?: (partial: YouTubePlaylistResult) => void;
    /**
     * `name=value; name2=value2` for the signed-in YouTube account. Enables
     * personal lists. Build it with `cookieHeaderFromNetscape` or take it from
     * the WebView cookie manager.
     */
    cookieHeader?: string | null;
    /** Hard cap for fixed playlists. Default 1000. */
    maxPlaylistItems?: number;
    /** Cap for infinite mixes. Default 150. */
    maxMixItems?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CLIENTS = {
    web: {
        host: 'https://www.youtube.com',
        clientName: 'WEB',
        clientVersion: '2.20250101.00.00',
        clientId: '1',
    },
    music: {
        host: 'https://music.youtube.com',
        clientName: 'WEB_REMIX',
        clientVersion: '1.20250101.01.00',
        clientId: '67',
    },
} as const;

type ClientKey = keyof typeof CLIENTS;

const DEFAULT_MAX_PLAYLIST_ITEMS = 1000;
const DEFAULT_MAX_MIX_ITEMS = 150;
const MAX_PAGES = 15;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

/** Lists that only exist for a signed-in account. */
const AUTH_ONLY_LISTS = new Set(['WL', 'LL', 'LM', 'RDMM', 'SE']);

/** RD… ids that are fixed lists (read with browse), not seeded radios. */
const FIXED_RD_PREFIXES = ['RDCLAK', 'RDTMAK', 'RDMM'];

const GREY_OUT = 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT';

// ─── URL parsing ───────────────────────────────────────────────────────────

const HOST_RE =
    /^(?:https?:\/\/)?((?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com))(?=[/:?#]|$)/i;

/** Mix ids start with RD, except the fixed-list families above. */
function isMixId(listId: string): boolean {
    return listId.startsWith('RD') && !FIXED_RD_PREFIXES.some(p => listId.startsWith(p));
}

/** RD<id> / RDAMVM<id> embed the seed video; other mix families do not. */
function seedFromListId(listId: string): string | null {
    const m = /^RD(?:AMVM)?([A-Za-z0-9_-]{11})$/.exec(listId);
    return m ? m[1] : null;
}

/**
 * Reads the playlist id (and optional video id) out of any YouTube or
 * YouTube Music link. Returns null when the link has no `list=`.
 *
 * Hand-rolled instead of `new URL()`: React Native's URL polyfill has no
 * working `searchParams`.
 */
export function parseYouTubePlaylistUrl(input: string): ParsedYouTubePlaylistUrl | null {
    const text = (input || '').trim();
    const host = HOST_RE.exec(text);
    if (!host) return null;

    const list = /[?&]list=([A-Za-z0-9_-]+)/.exec(text);
    if (!list) return null;
    const listId = list[1];

    const v =
        /[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(text) ||
        /youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(text);

    return {
        listId,
        videoId: v ? v[1] : null,
        kind: isMixId(listId) ? 'mix' : 'playlist',
        isMusicHost: /(^|\.)music\.youtube\.com$/i.test(host[1]),
        requiresAuth: AUTH_ONLY_LISTS.has(listId),
    };
}

// ─── Cookies & request signing ─────────────────────────────────────────────

/**
 * Turns a Netscape cookies.txt (what yt-dlp uses) into a `Cookie:` header
 * containing only the YouTube / Google cookies that have not expired.
 */
export function cookieHeaderFromNetscape(text: string): string | null {
    if (!text) return null;
    const now = Math.floor(Date.now() / 1000);
    const jar = new Map<string, string>();

    for (const rawLine of text.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (!line) continue;
        // "#HttpOnly_" marks a real cookie, any other "#" is a comment.
        if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
        else if (line.startsWith('#')) continue;

        const f = line.split('\t');
        if (f.length < 7) continue;
        const domain = f[0].replace(/^\./, '').toLowerCase();
        if (!/(^|\.)(youtube\.com|google\.com)$/.test(domain)) continue;

        const expiry = parseInt(f[4], 10);
        if (expiry > 0 && expiry < now) continue;

        jar.set(f[5], f.slice(6).join('\t'));
    }

    if (jar.size === 0) return null;
    return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

function parseCookieHeader(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}

/** SHA-1 of a (UTF-8) string as lowercase hex. */
export function sha1Hex(message: string): string {
    const utf8 = unescape(encodeURIComponent(message));
    const bytes: number[] = [];
    for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    for (let i = 3; i >= 0; i--) bytes.push((hi >>> (i * 8)) & 0xff);
    for (let i = 3; i >= 0; i--) bytes.push((lo >>> (i * 8)) & 0xff);

    let h0 = 0x67452301;
    let h1 = 0xefcdab89 | 0;
    let h2 = 0x98badcfe | 0;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0 | 0;
    const w = new Array<number>(80);

    for (let off = 0; off < bytes.length; off += 64) {
        for (let i = 0; i < 16; i++) {
            const j = off + i * 4;
            w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
        }
        for (let i = 16; i < 80; i++) {
            const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (x << 1) | (x >>> 31);
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        for (let i = 0; i < 80; i++) {
            let f: number;
            let k: number;
            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5a827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc;
            } else {
                f = b ^ c ^ d;
                k = 0xca62c1d6;
            }
            const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
            e = d;
            d = c;
            c = (b << 30) | (b >>> 2);
            b = a;
            a = t;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }

    return [h0, h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * Headers that sign a request as the signed-in user, the way the web client
 * (and yt-dlp) do: SAPISIDHASH = "<ts>_<sha1(ts SAPISID origin)>".
 */
export function buildAuthHeaders(cookieHeader: string, origin: string, nowMs = Date.now()): Record<string, string> {
    const jar = parseCookieHeader(cookieHeader);
    const ts = Math.floor(nowMs / 1000);
    const parts: string[] = [];
    const add = (label: string, secret?: string) => {
        if (secret) parts.push(`${label} ${ts}_${sha1Hex(`${ts} ${secret} ${origin}`)}`);
    };
    add('SAPISIDHASH', jar.SAPISID || jar['__Secure-3PAPISID']);
    add('SAPISID1PHASH', jar['__Secure-1PAPISID']);
    add('SAPISID3PHASH', jar['__Secure-3PAPISID']);

    const headers: Record<string, string> = { Cookie: cookieHeader };
    if (parts.length) {
        headers.Authorization = parts.join(' ');
        headers['X-Goog-AuthUser'] = '0';
        headers['X-Origin'] = origin;
    }
    return headers;
}

/** True when the cookies contain what is needed to sign requests. */
function canSign(cookieHeader?: string | null): cookieHeader is string {
    if (!cookieHeader) return false;
    const jar = parseCookieHeader(cookieHeader);
    return !!(jar.SAPISID || jar['__Secure-3PAPISID'] || jar['__Secure-1PAPISID']);
}

// ─── JSON helpers ──────────────────────────────────────────────────────────

/** InnerTube text: `{simpleText}` or `{runs:[{text}]}`. */
function textOf(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node.simpleText === 'string') return node.simpleText;
    if (Array.isArray(node.runs)) return node.runs.map((r: any) => r?.text ?? '').join('');
    if (typeof node.content === 'string') return node.content;
    return '';
}

/** First value stored under `key` anywhere in the tree (depth-first). */
function findFirst(node: any, key: string): any {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
        for (const child of node) {
            const hit = findFirst(child, key);
            if (hit !== undefined) return hit;
        }
        return undefined;
    }
    if (key in node) return node[key];
    for (const k of Object.keys(node)) {
        const hit = findFirst(node[k], key);
        if (hit !== undefined) return hit;
    }
    return undefined;
}

/** First string `token` anywhere in the subtree. */
function findToken(node: any): string | null {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.token === 'string') return node.token;
    const children = Array.isArray(node) ? node : Object.keys(node).map(k => node[k]);
    for (const child of children) {
        const t = findToken(child);
        if (t) return t;
    }
    return null;
}

const DURATION_RE = /^\d{1,2}(?::\d{2}){1,2}$/;
const UNAVAILABLE_RE = /^\[?(?:deleted|private) video\]?$/i;

/** Counters shared by the parsers so the UI can say how many were hidden. */
interface ParseStats {
    unavailable: number;
}

/** Rewrites a googleusercontent size suffix to a square `px` crop. */
function resizeGoogleArt(url: string, px: number): string {
    const suffix = `=w${px}-h${px}-l90-rj`;
    return /=[wsh]\d[^=/]*$/.test(url) ? url.replace(/=[wsh]\d[^=/]*$/, suffix) : `${url}${suffix}`;
}

/**
 * Picks a thumbnail sized for a list row. Real square album art
 * (googleusercontent) is preferred; otherwise the stable mqdefault frame.
 */
function rowThumb(videoId: string, sources?: Array<{ url?: string }>): string {
    const art = sources?.find(s => s?.url && /googleusercontent\.com/.test(s.url));
    if (art?.url) return resizeGoogleArt(art.url, 226);
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Biggest source of a thumbnail list, upgraded to `px` if it is Google art. */
function coverFrom(sources?: Array<{ url?: string; width?: number }>, px = 544): string | undefined {
    if (!sources || sources.length === 0) return undefined;
    const best = sources.reduce((a, b) => ((b.width ?? 0) >= (a.width ?? 0) ? b : a), sources[0]);
    if (!best.url) return undefined;
    return /googleusercontent\.com/.test(best.url) ? resizeGoogleArt(best.url, px) : best.url;
}

function watchUrl(videoId: string, musicHost: boolean): string {
    return `${musicHost ? CLIENTS.music.host : CLIENTS.web.host}/watch?v=${videoId}`;
}

function totalFromText(text: string): number | undefined {
    const m = /([\d,.]+)\s+(?:videos?|songs?|tracks?)\b/i.exec(text);
    return m ? parseInt(m[1].replace(/[,.]/g, ''), 10) : undefined;
}

// ─── Network ───────────────────────────────────────────────────────────────

export function isAbortError(e: unknown): boolean {
    return !!e && typeof e === 'object' && (e as any).name === 'AbortError';
}

function abortError(): Error {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(abortError());
        });
    });
}

/**
 * One InnerTube POST with a per-request timeout and a couple of retries on
 * network errors, 429 and 5xx. A caller abort is never retried.
 */
async function innertube(
    client: ClientKey,
    endpoint: 'browse' | 'next',
    body: Record<string, unknown>,
    signal?: AbortSignal,
    cookieHeader?: string | null,
): Promise<any> {
    const c = CLIENTS[client];
    const payload = JSON.stringify({
        ...body,
        context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: 'en', gl: 'US' } },
    });
    const authHeaders = canSign(cookieHeader) ? buildAuthHeaders(cookieHeader, c.host) : {};

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) throw abortError();

        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(`${c.host}/youtubei/v1/${endpoint}?prettyPrint=false`, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': UA,
                    'Accept-Language': 'en-US,en;q=0.9',
                    Origin: c.host,
                    'X-YouTube-Client-Name': c.clientId,
                    'X-YouTube-Client-Version': c.clientVersion,
                    ...authHeaders,
                },
                body: payload,
            });

            if (res.status === 429 || res.status >= 500) {
                lastError = new YouTubePlaylistError('NETWORK', `InnerTube ${endpoint} returned ${res.status}`);
            } else if (res.status === 401 || res.status === 403) {
                throw new YouTubePlaylistError('AUTH', `InnerTube ${endpoint} returned ${res.status}`);
            } else if (!res.ok) {
                // 4xx other than 429 will not get better by retrying.
                throw new YouTubePlaylistError('NETWORK', `InnerTube ${endpoint} returned ${res.status}`);
            } else {
                return await res.json();
            }
        } catch (e) {
            if (signal?.aborted) throw abortError();
            if (e instanceof YouTubePlaylistError) throw e;
            // Timeout (our own abort) or a transport error: retry.
            lastError = e;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }

        if (attempt < MAX_RETRIES) await sleep(400 * (attempt + 1), signal);
    }

    throw lastError instanceof Error
        ? lastError
        : new YouTubePlaylistError('NETWORK', `InnerTube ${endpoint} failed`);
}

// ─── Shared collection helper ──────────────────────────────────────────────

function makeCollector(max: number) {
    const seen = new Set<string>();
    const items: YouTubePlaylistItem[] = [];
    const stats: ParseStats = { unavailable: 0 };
    const add = (batch: YouTubePlaylistItem[]): number => {
        let added = 0;
        for (const it of batch) {
            if (seen.has(it.id) || items.length >= max) continue;
            seen.add(it.id);
            items.push(it);
            added++;
        }
        return added;
    };
    return { items, stats, add };
}

// ─── Loader 1: YouTube Music playlist (music browse) ───────────────────────

function parseMusicListItem(r: any, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem | null {
    if (!r) return null;

    // Greyed-out rows are tracks YouTube Music itself cannot play.
    const id: string | undefined = r.playlistItemData?.videoId ?? findFirst(r.overlay, 'videoId');
    if (r.musicItemRendererDisplayPolicy === GREY_OUT || !id) {
        stats.unavailable++;
        return null;
    }

    const cols: any[] = r.flexColumns ?? [];
    const col = (i: number) => textOf(cols[i]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
    const title = col(0);
    if (!title || UNAVAILABLE_RE.test(title)) {
        stats.unavailable++;
        return null;
    }

    const dur = textOf(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text).trim();
    return {
        id,
        title,
        author: col(1),
        duration: DURATION_RE.test(dur) ? dur : undefined,
        thumbnail: rowThumb(id, r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
        url: watchUrl(id, musicHost),
        type: 'youtube',
    };
}

function parseMusicEntries(entries: any[] | undefined, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem[] {
    const out: YouTubePlaylistItem[] = [];
    for (const e of entries ?? []) {
        if (!e?.musicResponsiveListItemRenderer) continue;
        const item = parseMusicListItem(e.musicResponsiveListItemRenderer, musicHost, stats);
        if (item) out.push(item);
    }
    return out;
}

function musicNextToken(node: any): string | null {
    const c = node?.continuations?.[0];
    return c?.nextContinuationData?.continuation ?? c?.nextRadioContinuationData?.continuation ?? null;
}

async function loadMusicPlaylist(
    parsed: ParsedYouTubePlaylistUrl,
    opts: FetchYouTubePlaylistOptions,
    cookieHeader: string | null,
): Promise<YouTubePlaylistResult> {
    const max = opts.maxPlaylistItems ?? DEFAULT_MAX_PLAYLIST_ITEMS;
    const usedLogin = !!cookieHeader;

    const data = await innertube('music', 'browse', { browseId: `VL${parsed.listId}` }, opts.signal, cookieHeader);
    const shelf = findFirst(data, 'musicPlaylistShelfRenderer');
    if (!shelf) throw new YouTubePlaylistError('EMPTY', 'Music playlist not found.');

    const header =
        findFirst(data, 'musicResponsiveHeaderRenderer') ??
        findFirst(data, 'musicDetailHeaderRenderer') ??
        {};
    const title = textOf(header.title).trim() || 'Playlist';
    const cover = coverFrom(findFirst(header.thumbnail, 'thumbnails'), 544);
    const stats1 = textOf(header.secondSubtitle).trim() || textOf(header.subtitle).trim();
    const total = totalFromText(stats1);

    const { items, stats, add } = makeCollector(max);
    const firstRows = parseMusicEntries(shelf.contents, parsed.isMusicHost, stats);
    if (add(firstRows) === 0) {
        throw new YouTubePlaylistError('EMPTY', 'Playlist has no playable tracks.');
    }

    const snapshot = (token: string | null): YouTubePlaylistResult => ({
        title,
        thumbnail: cover,
        subtitle: stats1 || `Playlist • ${items.length} tracks`,
        kind: 'playlist',
        items: items.slice(),
        totalCount: total,
        truncated: !!token && items.length >= max,
        unavailableCount: stats.unavailable,
        usedLogin,
    });

    let token = musicNextToken(shelf);
    opts.onProgress?.(snapshot(token));

    let pages = 1;
    while (token && items.length < max && pages < MAX_PAGES) {
        try {
            const next = await innertube('music', 'browse', { continuation: token }, opts.signal, cookieHeader);
            const cont = next?.continuationContents?.musicPlaylistShelfContinuation;
            let rows: any[] | undefined;
            let nextToken: string | null = null;
            if (cont) {
                rows = cont.contents;
                nextToken = musicNextToken(cont);
            } else {
                // Newer "append" style continuation.
                const actions: any[] = next?.onResponseReceivedActions ?? [];
                const append = actions.find(a => a?.appendContinuationItemsAction)?.appendContinuationItemsAction;
                rows = append?.continuationItems;
                const last = rows?.[rows.length - 1];
                nextToken = last?.continuationItemRenderer ? findToken(last) : null;
            }
            const added = add(parseMusicEntries(rows, parsed.isMusicHost, stats));
            token = added > 0 ? nextToken : null;
        } catch (e) {
            if (isAbortError(e)) throw e;
            console.warn('[YTPlaylist] music continuation failed, returning partial list:', e);
            break;
        }
        pages++;
        opts.onProgress?.(snapshot(token));
    }

    return snapshot(token);
}

// ─── Loader 2: regular playlist (web browse, lockupViewModel) ──────────────

function parseLockup(vm: any, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem | null {
    if (!vm) return null;
    // Skip nested playlists / channels that can appear in a list.
    if (vm.contentType && vm.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;

    const id: string | undefined = vm.contentId;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

    const meta = vm.metadata?.lockupMetadataViewModel;
    const title = textOf(meta?.title).trim();
    if (!title || UNAVAILABLE_RE.test(title)) {
        stats.unavailable++;
        return null;
    }

    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows;
    const author = textOf(rows?.[0]?.metadataParts?.[0]?.text).trim();

    // The duration is a badge on the thumbnail ("3:55"). Live streams carry
    // "LIVE" instead, which the pattern deliberately rejects.
    let duration: string | undefined;
    const badges: any[] = [];
    const collectBadges = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (n.thumbnailBadgeViewModel) badges.push(n.thumbnailBadgeViewModel);
        for (const k of Object.keys(n)) collectBadges(n[k]);
    };
    collectBadges(vm.contentImage?.thumbnailViewModel?.overlays);
    for (const b of badges) {
        const t = typeof b.text === 'string' ? b.text : textOf(b.text);
        if (DURATION_RE.test(t.trim())) {
            duration = t.trim();
            break;
        }
    }

    return {
        id,
        title,
        author,
        duration,
        thumbnail: rowThumb(id, vm.contentImage?.thumbnailViewModel?.image?.sources),
        url: watchUrl(id, musicHost),
        type: 'youtube',
    };
}

function parseLegacyPlaylistVideo(r: any, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem | null {
    const id: string | undefined = r?.videoId;
    if (!id) return null;
    const title = textOf(r.title).trim();
    if (!title || UNAVAILABLE_RE.test(title) || r.isPlayable === false) {
        stats.unavailable++;
        return null;
    }
    const dur = textOf(r.lengthText).trim();
    return {
        id,
        title,
        author: textOf(r.shortBylineText).trim(),
        duration: DURATION_RE.test(dur) ? dur : undefined,
        thumbnail: rowThumb(id, r.thumbnail?.thumbnails),
        url: watchUrl(id, musicHost),
        type: 'youtube',
    };
}

function parseBrowseEntries(entries: any[] | undefined, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem[] {
    const out: YouTubePlaylistItem[] = [];
    for (const e of entries ?? []) {
        const item = e?.lockupViewModel
            ? parseLockup(e.lockupViewModel, musicHost, stats)
            : e?.playlistVideoRenderer
            ? parseLegacyPlaylistVideo(e.playlistVideoRenderer, musicHost, stats)
            : null;
        if (item) out.push(item);
    }
    return out;
}

/** Continuation token for "the next page of THIS list" (not suggestions). */
function browseNextToken(entries: any[] | undefined): string | null {
    if (!entries) return null;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e?.continuationItemViewModel || e?.continuationItemRenderer) return findToken(e);
    }
    return null;
}

function firstPageEntries(data: any): any[] | undefined {
    const section =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
            ?.contents?.[0]?.itemSectionRenderer?.contents;
    // Legacy layout nests the rows one level deeper.
    return section?.[0]?.playlistVideoListRenderer?.contents ?? section;
}

function continuationEntries(data: any): any[] | undefined {
    const actions: any[] = data?.onResponseReceivedActions ?? [];
    for (const a of actions) {
        const items =
            a?.appendContinuationItemsAction?.continuationItems ??
            a?.reloadContinuationItemsCommand?.continuationItems;
        if (items) return items;
    }
    return undefined;
}

function webPlaylistHeader(data: any): { title: string; thumbnail?: string; total?: number } {
    const header = data?.header?.pageHeaderRenderer;
    const title =
        textOf(header?.pageTitle) ||
        textOf(data?.metadata?.playlistMetadataRenderer?.title) ||
        textOf(findFirst(header?.content?.pageHeaderViewModel?.title, 'content')) ||
        'Playlist';

    let total: number | undefined;
    const rows = header?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
    for (const row of rows ?? []) {
        for (const part of row?.metadataParts ?? []) {
            total = totalFromText(textOf(part?.text));
            if (total !== undefined) break;
        }
        if (total !== undefined) break;
    }

    const sources = findFirst(header?.content?.pageHeaderViewModel?.heroImage, 'sources');
    return { title, thumbnail: coverFrom(sources, 544), total };
}

async function loadWebPlaylist(
    parsed: ParsedYouTubePlaylistUrl,
    opts: FetchYouTubePlaylistOptions,
    cookieHeader: string | null,
): Promise<YouTubePlaylistResult> {
    const max = opts.maxPlaylistItems ?? DEFAULT_MAX_PLAYLIST_ITEMS;
    const usedLogin = !!cookieHeader;

    const data = await innertube('web', 'browse', { browseId: `VL${parsed.listId}` }, opts.signal, cookieHeader);
    const entries = firstPageEntries(data);
    const header = webPlaylistHeader(data);

    const { items, stats, add } = makeCollector(max);
    if (add(parseBrowseEntries(entries, parsed.isMusicHost, stats)) === 0) {
        // Private, deleted and region-locked playlists come back with no rows.
        throw new YouTubePlaylistError('EMPTY', 'Playlist has no readable videos (private or unavailable).');
    }

    const snapshot = (token: string | null): YouTubePlaylistResult => ({
        title: header.title,
        thumbnail: header.thumbnail,
        subtitle: `Playlist • ${header.total ?? items.length} videos`,
        kind: 'playlist',
        items: items.slice(),
        totalCount: header.total,
        truncated: !!token && items.length >= max,
        unavailableCount: stats.unavailable,
        usedLogin,
    });

    let token = browseNextToken(entries);
    opts.onProgress?.(snapshot(token));

    let pages = 1;
    while (token && items.length < max && pages < MAX_PAGES) {
        try {
            const next = await innertube('web', 'browse', { continuation: token }, opts.signal, cookieHeader);
            const rows = continuationEntries(next);
            const added = add(parseBrowseEntries(rows, parsed.isMusicHost, stats));
            token = added > 0 ? browseNextToken(rows) : null;
        } catch (e) {
            if (isAbortError(e)) throw e;
            console.warn('[YTPlaylist] continuation failed, returning partial list:', e);
            break;
        }
        pages++;
        opts.onProgress?.(snapshot(token));
    }

    return snapshot(token);
}

// ─── Loader 3: mix (music next) ────────────────────────────────────────────

function parsePanelVideo(r: any, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem | null {
    const id: string | undefined = r?.videoId;
    if (!id) return null;
    const title = textOf(r.title).trim();
    // `unplayableText` is set on tracks that are removed or blocked.
    if (!title || UNAVAILABLE_RE.test(title) || r.unplayableText) {
        stats.unavailable++;
        return null;
    }

    // longBylineText is "Artist • 1.8B views • 19M likes": only the first run
    // (the artist/channel) is wanted.
    const runs: any[] = r.longBylineText?.runs ?? r.shortBylineText?.runs ?? [];
    const author = (runs[0]?.text ?? '').trim();

    const dur = textOf(r.lengthText).trim();
    return {
        id,
        title,
        author,
        duration: DURATION_RE.test(dur) ? dur : undefined,
        thumbnail: rowThumb(id, r.thumbnail?.thumbnails),
        url: watchUrl(id, musicHost),
        type: 'youtube',
    };
}

/**
 * Panel contents hold either plain `playlistPanelVideoRenderer`s or wrappers
 * that pair an audio track with its music-video counterpart. Only the primary
 * renderer is taken from a wrapper, otherwise every song appears twice.
 */
function parsePanelContents(contents: any[] | undefined, musicHost: boolean, stats: ParseStats): YouTubePlaylistItem[] {
    const out: YouTubePlaylistItem[] = [];
    for (const c of contents ?? []) {
        const renderer =
            c?.playlistPanelVideoRenderer ??
            c?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
        if (!renderer) continue;
        const item = parsePanelVideo(renderer, musicHost, stats);
        if (item) out.push(item);
    }
    return out;
}

async function loadMix(
    parsed: ParsedYouTubePlaylistUrl,
    opts: FetchYouTubePlaylistOptions,
    cookieHeader: string | null,
): Promise<YouTubePlaylistResult> {
    const max = opts.maxMixItems ?? DEFAULT_MAX_MIX_ITEMS;
    const usedLogin = !!cookieHeader;

    // The link's own video leads; otherwise use the seed baked into the id.
    const seed = parsed.videoId ?? seedFromListId(parsed.listId);
    const body: Record<string, unknown> = { playlistId: parsed.listId };
    if (seed) body.videoId = seed;

    const data = await innertube('music', 'next', body, opts.signal, cookieHeader);
    const panel = findFirst(data, 'playlistPanelRenderer');

    const { items, stats, add } = makeCollector(max);
    if (!panel || add(parsePanelContents(panel.contents, parsed.isMusicHost, stats)) === 0) {
        throw new YouTubePlaylistError('EMPTY', 'Mix returned no tracks.');
    }

    const title = `Mix – ${items[0].title}`;
    const snapshot = (): YouTubePlaylistResult => ({
        title,
        // No cover of its own: the sheet builds a collage from the first tracks.
        thumbnail: undefined,
        subtitle: `Mix • ${items.length} tracks`,
        kind: 'mix',
        items: items.slice(),
        truncated: false,
        unavailableCount: stats.unavailable,
        usedLogin,
    });

    let token = musicNextToken(panel);
    opts.onProgress?.(snapshot());

    let pages = 1;
    let emptyPages = 0;
    while (token && items.length < max && pages < MAX_PAGES) {
        try {
            const next = await innertube('music', 'next', { continuation: token }, opts.signal, cookieHeader);
            const cont = next?.continuationContents?.playlistPanelContinuation;
            if (!cont) break;

            const added = add(parsePanelContents(cont.contents, parsed.isMusicHost, stats));
            // Mix pages overlap heavily. Two pages in a row with nothing new
            // means the radio has started repeating itself.
            emptyPages = added === 0 ? emptyPages + 1 : 0;
            if (emptyPages >= 2) break;
            token = musicNextToken(cont);
        } catch (e) {
            if (isAbortError(e)) throw e;
            console.warn('[YTPlaylist] mix continuation failed, returning partial list:', e);
            break;
        }
        pages++;
        opts.onProgress?.(snapshot());
    }

    return snapshot();
}

// ─── Public API ────────────────────────────────────────────────────────────

type Loader = (
    parsed: ParsedYouTubePlaylistUrl,
    opts: FetchYouTubePlaylistOptions,
    cookieHeader: string | null,
) => Promise<YouTubePlaylistResult>;

/** Runs the loaders for one identity (anonymous or signed in) until one yields tracks. */
async function loadWith(
    parsed: ParsedYouTubePlaylistUrl,
    opts: FetchYouTubePlaylistOptions,
    cookieHeader: string | null,
): Promise<YouTubePlaylistResult> {
    // A wrong guess about the list family shows up as EMPTY, so every family is
    // tried, most likely first.
    const order: Loader[] =
        parsed.kind === 'mix'
            ? [loadMix, loadMusicPlaylist, loadWebPlaylist]
            : [loadMusicPlaylist, loadWebPlaylist, loadMix];

    let firstError: unknown = null;
    for (const loader of order) {
        try {
            return await loader(parsed, opts, cookieHeader);
        } catch (e) {
            if (isAbortError(e)) throw e;
            // Real network trouble will not improve with another loader.
            if (e instanceof YouTubePlaylistError && e.code === 'NETWORK') throw e;
            firstError = firstError ?? e;
        }
    }
    throw firstError instanceof Error
        ? firstError
        : new YouTubePlaylistError('EMPTY', 'Playlist is empty or unavailable.');
}

/**
 * Loads a YouTube / YouTube Music playlist or mix from a link.
 *
 * Rejects with `YouTubePlaylistError`:
 *   NOT_PLAYLIST  the link has no list= (use the single-video path)
 *   AUTH          needs a signed-in account and none (or a stale one) was given
 *   EMPTY         private, deleted or empty
 *   NETWORK       transport / HTTP failure on the first page
 * A caller abort rejects with an error where `isAbortError()` is true.
 */
export async function fetchYouTubePlaylist(
    input: string,
    options: FetchYouTubePlaylistOptions = {},
): Promise<YouTubePlaylistResult> {
    const parsed = parseYouTubePlaylistUrl(input);
    if (!parsed) throw new YouTubePlaylistError('NOT_PLAYLIST', 'Link has no playlist id.');

    const cookies = canSign(options.cookieHeader) ? options.cookieHeader : null;

    if (parsed.requiresAuth) {
        if (!cookies) throw new YouTubePlaylistError('AUTH', 'This list is only available when signed in.');
        return loadWith(parsed, options, cookies);
    }

    try {
        return await loadWith(parsed, options, null);
    } catch (e) {
        if (isAbortError(e)) throw e;
        // Personal lists ("Mixed for you", private playlists) look empty to an
        // anonymous caller: retry once as the signed-in user.
        if (cookies && e instanceof YouTubePlaylistError && (e.code === 'EMPTY' || e.code === 'AUTH')) {
            return loadWith(parsed, options, cookies);
        }
        if (!cookies && e instanceof YouTubePlaylistError && e.code === 'EMPTY') {
            throw new YouTubePlaylistError(
                'AUTH',
                'This list is private or personal. Sign in to YouTube to load it.',
            );
        }
        throw e;
    }
}
