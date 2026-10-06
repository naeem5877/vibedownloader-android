/**
 * GitHub Update Service
 *
 * Reads releases from GitHub and decides whether the installed build is out of
 * date. Three things this deliberately gets right:
 *
 *  1. The installed version comes from the package manager (native), never from
 *     a constant in JS. A hardcoded constant went stale after an update and made
 *     the "update available" prompt appear forever.
 *  2. The APK offered matches the ABI the app is running as. Someone on the
 *     armeabi-v7a build is offered armeabi-v7a, not a 100 MB universal file.
 *  3. Release notes keep their structure (headings, bullets, links, bold)
 *     instead of being flattened into five lines.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { YtDlpNative } from '../native/YtDlpModule';

const REPO_OWNER = 'naeem5877';
const REPO_NAME = 'vibedownloader-android';
const RELEASES_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;

/** Used only if the native call fails. Bump together with android versionName. */
const FALLBACK_VERSION = require('../../package.json').version as string;

const DISMISS_KEY = 'update_dismissed_v2';
const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Release notes model
// ---------------------------------------------------------------------------

/** A run of inline text. Links and bold survive from the GitHub markdown. */
export type NoteSpan =
    | { type: 'text'; text: string }
    | { type: 'bold'; text: string }
    | { type: 'code'; text: string }
    | { type: 'link'; text: string; url: string };

export type NoteBlock =
    | { type: 'heading'; level: number; spans: NoteSpan[] }
    | { type: 'paragraph'; spans: NoteSpan[] }
    | { type: 'bullet'; depth: number; spans: NoteSpan[] };

export interface ReleaseAsset {
    name: string;
    url: string;
    size: number;
    abi: string;
}

export interface ReleaseInfo {
    version: string;
    tag: string;
    name: string;
    publishedAt: string | null;
    releaseUrl: string;
    notes: NoteBlock[];
}

export interface InstalledApp {
    version: string;
    versionCode: number;
    abi: string;
}

export interface UpdateInfo {
    available: boolean;
    /** Installed version, always set. */
    currentVersion: string;
    /** Newest release version; equals currentVersion when up to date. */
    version: string;
    releaseUrl: string;
    downloadUrl?: string;
    /** Which APK `downloadUrl` is (e.g. "armeabi-v7a", "universal"). */
    assetAbi?: string;
    assetSize?: number;
    publishedAt?: string | null;
    releaseName?: string;
    notes: NoteBlock[];
    /** Why no update is shown, for logs: 'up-to-date' | 'dismissed' | 'error'. */
    reason?: string;
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

interface ParsedVersion {
    nums: number[];
    pre: string;
}

const parseVersion = (v: string): ParsedVersion => {
    const clean = v.trim().replace(/^v/i, '');
    const [core, ...preParts] = clean.split('-');
    const nums = core.split('.').map(p => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
    });
    return { nums, pre: preParts.join('-') };
};

/** 1 if a > b, -1 if a < b, 0 if equal. A release beats its own pre-release. */
export const compareVersions = (a: string, b: string): number => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
        const x = pa.nums[i] ?? 0;
        const y = pb.nums[i] ?? 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    if (pa.pre === pb.pre) return 0;
    if (!pa.pre) return 1;
    if (!pb.pre) return -1;
    return pa.pre > pb.pre ? 1 : -1;
};

// ---------------------------------------------------------------------------
// Installed app
// ---------------------------------------------------------------------------

let installedCache: InstalledApp | null = null;

export const getInstalledApp = async (): Promise<InstalledApp> => {
    if (installedCache) return installedCache;
    try {
        const info = await YtDlpNative.getAppInfo();
        if (info?.versionName) {
            installedCache = {
                version: info.versionName,
                versionCode: info.versionCode,
                abi: info.abi,
            };
            return installedCache;
        }
    } catch (e) {
        console.warn('getAppInfo failed, falling back to package.json version:', e);
    }
    return { version: FALLBACK_VERSION, versionCode: 0, abi: '' };
};

/** Synchronous best guess for places that cannot await (display only). */
export const getCurrentVersion = (): string => installedCache?.version ?? FALLBACK_VERSION;

// ---------------------------------------------------------------------------
// Markdown -> structured notes
// ---------------------------------------------------------------------------

const INLINE_RE = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>)\]]+)/g;

export const parseInline = (input: string): NoteSpan[] => {
    const spans: NoteSpan[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(input)) !== null) {
        if (m.index > last) spans.push({ type: 'text', text: input.slice(last, m.index) });
        if (m[1] !== undefined || m[2] !== undefined) {
            spans.push({ type: 'bold', text: (m[1] ?? m[2]) as string });
        } else if (m[3] !== undefined) {
            spans.push({ type: 'code', text: m[3] });
        } else if (m[4] !== undefined && m[5] !== undefined) {
            spans.push({ type: 'link', text: m[4], url: m[5] });
        } else if (m[6] !== undefined) {
            // Trailing punctuation belongs to the sentence, not the url.
            const url = m[6].replace(/[.,;:!?]+$/, '');
            const trailing = m[6].slice(url.length);
            spans.push({ type: 'link', text: prettyUrl(url), url });
            if (trailing) spans.push({ type: 'text', text: trailing });
        }
        last = m.index + m[0].length;
    }
    if (last < input.length) spans.push({ type: 'text', text: input.slice(last) });
    return spans;
};

/** `https://github.com/o/r/pull/12` -> `o/r#12`; other urls lose the scheme. */
const prettyUrl = (url: string): string => {
    const pr = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)\/?$/i);
    if (pr) return `${pr[1]}#${pr[2]}`;
    return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
};

/**
 * Turns a GitHub release body into blocks. Anything that is only noise for a
 * phone screen is dropped: HTML, images, horizontal rules, the install-file
 * list and the "Full Changelog" compare link.
 */
export const parseReleaseNotes = (body: string | null | undefined): NoteBlock[] => {
    if (!body) return [];

    const text = body
        .replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/<\/?(?:br|p|div|details|summary|img|picture|source|center|h\d|b|i|strong|em)\b[^>]*>/gi, '');

    const blocks: NoteBlock[] = [];
    let skipSection = false;

    for (const rawLine of text.split('\n')) {
        const line = rawLine.replace(/\s+$/, '');
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^([-*_])\1{2,}$/.test(trimmed)) continue; // horizontal rule
        if (/^\*{0,2}full changelog\*{0,2}\s*:/i.test(trimmed)) continue;

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const title = heading[2].replace(/#+\s*$/, '').trim();
            // The per-ABI install table is for the GitHub page; the app picks the APK itself.
            skipSection = /^(?:[^\w]*\s*)?(install|installation|download|downloads|assets)\b/i.test(title);
            if (skipSection || !title) continue;
            // The release title heading ("VibeDownloader Android v2.1.0") repeats
            // what the dialog header already shows.
            if (/vibedownloader/i.test(title)) continue;
            blocks.push({ type: 'heading', level: Math.min(heading[1].length, 3), spans: parseInline(title) });
            continue;
        }
        if (skipSection) continue;

        const bullet = line.match(/^(\s*)[-*•+]\s+(.*)$/);
        if (bullet) {
            const content = bullet[2].trim();
            if (content.length === 0) continue;
            const depth = Math.min(Math.floor(bullet[1].replace(/\t/g, '  ').length / 2), 2);
            blocks.push({ type: 'bullet', depth, spans: parseInline(content) });
            continue;
        }

        // `Key: value` lines in bold-only form act as small headings in some releases.
        const boldOnly = trimmed.match(/^\*\*([^*]+)\*\*:?$/);
        if (boldOnly) {
            blocks.push({ type: 'heading', level: 3, spans: parseInline(boldOnly[1]) });
            continue;
        }

        blocks.push({ type: 'paragraph', spans: parseInline(trimmed) });
    }

    return blocks;
};

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

interface GitHubAsset {
    name: string;
    size: number;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name: string;
    name: string | null;
    html_url: string;
    body: string | null;
    draft: boolean;
    prerelease: boolean;
    published_at: string | null;
    assets: GitHubAsset[];
}

const KNOWN_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'] as const;

const assetAbi = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('universal')) return 'universal';
    // Longest first so "x86_64" is not read as "x86".
    for (const abi of [...KNOWN_ABIS].sort((a, b) => b.length - a.length)) {
        if (lower.includes(abi)) return abi;
    }
    return 'unknown';
};

/** Picks the APK that matches how the installed app runs, else universal. */
export const pickAsset = (assets: GitHubAsset[], abi: string, supportedAbis: string[] = []): ReleaseAsset | null => {
    const apks = (assets || [])
        .filter(a => a.name.toLowerCase().endsWith('.apk'))
        .map(a => ({ name: a.name, url: a.browser_download_url, size: a.size, abi: assetAbi(a.name) }));
    if (apks.length === 0) return null;

    // Same ABI as the installed build first, then the device's other ABIs in its
    // own preference order, then the universal build.
    const order = [abi, ...supportedAbis].filter(Boolean);
    for (const wanted of order) {
        const hit = apks.find(a => a.abi === wanted);
        if (hit) return hit;
    }
    return apks.find(a => a.abi === 'universal') ?? apks[0];
};

const fetchReleases = async (): Promise<GitHubRelease[]> => {
    const response = await fetch(`${RELEASES_API}?per_page=15`, {
        headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return response.json();
};

const toReleaseInfo = (r: GitHubRelease): ReleaseInfo => ({
    version: r.tag_name.replace(/^v/i, ''),
    tag: r.tag_name,
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    releaseUrl: r.html_url,
    notes: parseReleaseNotes(r.body),
});

/** Release notes for one exact version, used for the "what's new" screen. */
export const fetchReleaseNotes = async (version: string): Promise<ReleaseInfo | null> => {
    try {
        const releases = await fetchReleases();
        const hit = releases.find(r => !r.draft && compareVersions(r.tag_name, version) === 0);
        return hit ? toReleaseInfo(hit) : null;
    } catch (e) {
        console.warn('fetchReleaseNotes failed:', e);
        return null;
    }
};

// ---------------------------------------------------------------------------
// Dismissal ("Not now" should not nag on every launch)
// ---------------------------------------------------------------------------

export const dismissUpdate = async (version: string): Promise<void> => {
    try {
        await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify({ version, at: Date.now() }));
    } catch { /* non-critical */ }
};

const isDismissed = async (version: string): Promise<boolean> => {
    try {
        const raw = await AsyncStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const { version: v, at } = JSON.parse(raw);
        return v === version && Date.now() - at < DISMISS_FOR_MS;
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------------------
// Update check
// ---------------------------------------------------------------------------

/**
 * @param force  Ignore a recent "Not now" (manual "Check for updates").
 */
export const checkForUpdates = async (force = false): Promise<UpdateInfo> => {
    const installed = await getInstalledApp();
    const none = (reason: string, extra: Partial<UpdateInfo> = {}): UpdateInfo => ({
        available: false,
        currentVersion: installed.version,
        version: installed.version,
        releaseUrl: '',
        notes: [],
        reason,
        ...extra,
    });

    try {
        const releases = (await fetchReleases()).filter(r => !r.draft && !r.prerelease);
        if (releases.length === 0) return none('error');

        // Newest by version, not by API order: re-published or back-dated
        // releases do not always come back in version order.
        const latest = releases.reduce((best, r) => (compareVersions(r.tag_name, best.tag_name) > 0 ? r : best));
        const latestVersion = latest.tag_name.replace(/^v/i, '');

        if (compareVersions(latestVersion, installed.version) <= 0) {
            return none('up-to-date');
        }
        if (!force && (await isDismissed(latestVersion))) {
            return none('dismissed');
        }

        let supported: string[] = [];
        try {
            supported = (await YtDlpNative.getAppInfo()).supportedAbis || [];
        } catch { /* abi only narrows the choice */ }

        const asset = pickAsset(latest.assets, installed.abi, supported);
        const info = toReleaseInfo(latest);

        return {
            available: true,
            currentVersion: installed.version,
            version: latestVersion,
            releaseUrl: info.releaseUrl,
            downloadUrl: asset?.url,
            assetAbi: asset?.abi,
            assetSize: asset?.size,
            publishedAt: info.publishedAt,
            releaseName: info.name,
            notes: info.notes,
        };
    } catch (error) {
        console.warn('Update check failed:', error);
        return none('error');
    }
};
