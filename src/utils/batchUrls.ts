/**
 * URL parsing helpers for batch downloads.
 *
 * Deliberately avoids `URL` and `URLSearchParams`. React Native's built-in
 * `URL` is a minimal polyfill and does not implement `searchParams`, so those
 * APIs fail at runtime even though they typecheck once the DOM lib is added.
 * The project also has no `react-native-url-polyfill` dependency, and parsing by
 * hand keeps this module testable with plain node.
 *
 * The desktop app's parser is newline-only and does not dedupe, which means
 * pasting the same link twice downloads it twice into the same output path.
 * These helpers are deliberately stricter.
 */

/** Anything separated by a newline, comma, or tab is treated as its own entry. */
const SEPARATORS = /[\r\n,\t]+/;

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i;

/** Bare host such as `youtube.com/...` is accepted and upgraded to https. */
const BARE_HOST_RE = /^[\w-]+(\.[\w-]+)+/;

interface UrlParts {
    scheme: string;
    host: string;
    path: string;
    /** Query without the leading `?`. */
    query: string;
}

function splitUrl(raw: string): UrlParts | null {
    let input = raw.trim();
    if (!input) return null;

    if (!/^https?:\/\//i.test(input)) {
        // Only upgrade things that look like a domain, so stray prose is not
        // mistaken for a link.
        if (!BARE_HOST_RE.test(input)) return null;
        input = `https://${input}`;
    }

    const match = SCHEME_RE.exec(input);
    if (!match) return null;

    const scheme = match[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;

    const host = match[2].toLowerCase();
    if (!host) return null;

    // The capture group excludes the colon, but the rebuilt url needs it.
    return { scheme: `${scheme}:`, host, path: match[3] || '/', query: match[4] || '' };
}

/** Tracking parameters that ride along on shared links. */
const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'feature', 'si', 'fbclid', 'gclid',
];

function cleanQuery(query: string): string {
    if (!query) return '';

    const kept = query
        .split('&')
        .filter(pair => pair.length > 0)
        .filter(pair => {
            const key = pair.split('=')[0].toLowerCase();
            return !TRACKING_PARAMS.includes(key);
        })
        // Sorting makes parameter order irrelevant, so the same link pasted two
        // different ways collapses to one queue entry.
        .sort();

    return kept.length > 0 ? `?${kept.join('&')}` : '';
}

/**
 * Collapses the differences that make two textually different links the same
 * download: missing scheme, mobile/AMP hosts, trailing slashes, and tracking
 * parameters.
 */
export function normalizeUrl(raw: string): string {
    const parts = splitUrl(raw);
    if (!parts) return '';

    // A slash after a query would otherwise be captured as part of the query
    // value and come back percent-encoded, e.g. "v=abc%2F".
    let query = parts.query.replace(/\/+$/, '');

    const host = parts.host.replace(/^(www|m|amp)\./, '');
    const path = parts.path.replace(/\/+$/, '');

    return `${parts.scheme}//${host}${path}${cleanQuery(query)}`;
}

export type BatchPlatform = 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'spotify' | 'reddit' | 'other';

const PLATFORM_HOSTS: Array<[RegExp, BatchPlatform]> = [
    [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, 'youtube'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)(facebook\.com|fb\.watch|messenger\.com)$/, 'facebook'],
    [/(^|\.)tiktok\.com$/, 'tiktok'],
    [/(^|\.)(twitter\.com|x\.com)$/, 'twitter'],
    [/(^|\.)spotify\.com$/, 'spotify'],
    [/(^|\.)reddit\.com$/, 'reddit'],
];

/** Accepts a raw or already-normalized link. */
export function detectPlatform(url: string): BatchPlatform {
    const parts = splitUrl(normalizeUrl(url) || url);
    if (!parts) return 'other';

    const host = parts.host.replace(/^(www|m|amp)\./, '');
    for (const [pattern, platform] of PLATFORM_HOSTS) {
        if (pattern.test(host)) return platform;
    }
    return 'other';
}

export interface ParsedBatch {
    /** Unique, normalized, playable links in first-seen order. */
    urls: string[];
    /** Entries that looked like links but were dropped, for user feedback. */
    rejected: string[];
    /** Links that were valid but repeated an earlier one. */
    duplicates: string[];
    /** Platform tally, used to show what a paste actually contains. */
    platforms: Partial<Record<BatchPlatform, number>>;
}

/**
 * Turns a raw paste into a de-duplicated, ordered list of links.
 *
 * Never throws: unusable input is reported through `rejected` so the UI can
 * explain the drop instead of silently downloading fewer items than the user
 * pasted.
 */
export function parseBatchUrls(raw: string): ParsedBatch {
    const result: ParsedBatch = { urls: [], rejected: [], duplicates: [], platforms: {} };
    const seen = new Set<string>();

    for (const piece of raw.split(SEPARATORS)) {
        const candidate = piece.trim();
        if (!candidate) continue;

        const normalized = normalizeUrl(candidate);
        if (!normalized) {
            result.rejected.push(candidate);
            continue;
        }
        if (seen.has(normalized)) {
            result.duplicates.push(candidate);
            continue;
        }
        seen.add(normalized);
        result.urls.push(normalized);

        const platform = detectPlatform(normalized);
        result.platforms[platform] = (result.platforms[platform] ?? 0) + 1;
    }

    return result;
}
