/**
 * Lyrics entry point for the app.
 *
 * This is the only place that decides *whether* to look at all, and it
 * deliberately returns `null` for anything that is not a music track. That
 * keeps the "no lyrics = no UI" rule enforceable in one place instead of
 * relying on every caller to check.
 *
 * The lookup itself is best-effort and never throws: a provider outage, a
 * timeout, or malformed input all resolve to `null`, because the caller asks a
 * question it is happy to get no answer to.
 */

import { YtDlpNative } from '../native/YtDlpModule';
import { getLyrics } from './lyrics';
import { buildLyricsFile } from './lyrics/format';
import type { ExportMode } from './lyrics/format';
import type { LyricsResult } from './lyrics/types';

/** Providers are budgeted internally; this only bounds the whole call. */
const TOTAL_TIMEOUT_MS = 12_000;

/**
 * A caller-supplied title can be anything the user pasted, so it is bounded
 * before it reaches a URL or a scoring loop.
 */
const MAX_FIELD = 300;

/** Metadata the lookup needs, taken from whatever the fetch returned. */
export interface LyricsMetadata {
    title: string;
    uploader: string;
    /** Present for music downloads that already know their artist. */
    artist?: string;
    /** True for music.youtube.com, a Music category, or a `-Topic` uploader. */
    isMusic?: boolean;
    categories?: string[];
    duration?: number;
    platform?: string;
}

function cleanField(value: unknown, max = MAX_FIELD): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toDuration(value: unknown): number | undefined {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(n, 24 * 3600);
}

/**
 * True when the metadata represents something with lyrics worth looking up.
 *
 * A music.youtube.com host, a `Music` category, a `- Topic` uploader, or a title
 * that already carries an "Artist - Title" split all qualify. The last one is
 * deliberately loose: plenty of tracks upload without any of the other markers.
 */
export function isMusicCandidate(meta: LyricsMetadata): boolean {
    if (meta.isMusic === true) return true;

    const title = cleanField(meta.title);
    const artist = cleanField(meta.artist) || cleanField(meta.uploader);
    if (title && (artist || title.includes(' - ') || title.includes(' – '))) {
        return true;
    }

    const uploader = cleanField(meta.uploader);
    const categories = Array.isArray(meta.categories) ? meta.categories : [];
    return (
        uploader.endsWith('-Topic') ||
        categories.some((c) => String(c).toLowerCase() === 'music')
    );
}

/** The four formats a tab can export, so an unexpected value is rejected. */
export function isExportMode(value: unknown): value is ExportMode {
    return value === 'plain' || value === 'synced' || value === 'words' || value === 'translation';
}

/** Resolves with a value, or `null` if the whole call overruns its budget. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        work
            .then((v) => {
                clearTimeout(timer);
                resolve(v);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(null);
            });
    });
}

/**
 * Resolve the title/artist pair to search with, or `null` when there is not
 * enough metadata to try at all.
 */
function buildQuery(meta: LyricsMetadata): { title: string; artist: string; duration?: number } | null {
    if (!isMusicCandidate(meta)) return null;

    const title = cleanField(meta.title);
    let artist = cleanField(meta.artist);
    if (!artist && meta.uploader) {
        artist = cleanField(meta.uploader);
    }
    if (artist) {
        artist = artist.replace(/\s*[–—-]\s*Topic\s*$/i, '').trim();
    }
    if (!title) return null;
    if (!artist && !title.includes(' - ') && !title.includes(' – ')) return null;

    return { title, artist: artist || title, duration: toDuration(meta.duration) };
}

/**
 * Look up lyrics for one track.
 *
 * Never throws; resolves to `null` for "no lyrics", which is the signal the
 * panel uses to stay unmounted.
 */
export async function lookupLyrics(meta: LyricsMetadata): Promise<LyricsResult | null> {
    try {
        const query = buildQuery(meta);
        if (!query) return null;

        return await withTimeout(getLyrics(query), TOTAL_TIMEOUT_MS);
    } catch {
        // A lyrics lookup must never surface an error to the user.
        return null;
    }
}

export interface SaveLyricsResult {
    success: boolean;
    /** Absolute path when the platform could resolve one. */
    path?: string;
    fileName?: string;
    error?: string;
}

/**
 * Write the lyrics the user is currently looking at to a file.
 *
 * The payload is re-resolved here rather than trusted from the caller: a save
 * can arrive for a track the user has already navigated away from, and a cached
 * result would then write the wrong lyrics to disk. Re-running the lookup is one
 * request, and it guarantees the file matches what the panel was showing.
 */
export async function saveLyrics(
    meta: LyricsMetadata,
    mode: ExportMode,
    fallbackTitle: string,
    fallbackArtist: string
): Promise<SaveLyricsResult> {
    try {
        const query = buildQuery(meta);
        if (!query) {
            return { success: false, error: 'These are not lyrics for a music track.' };
        }

        const result = await withTimeout(getLyrics(query), TOTAL_TIMEOUT_MS);
        if (!result) {
            return { success: false, error: 'No lyrics were found for this track.' };
        }

        // Name the file after the track as the panel displays it. `displayTitle`
        // carries the credits and channel cut ("Ae Ajnabee", not "Ae Ajnabee
        // (Official Music Video) - Aditya Rikhari, Ravator | Coke Studio Bharat")
        // and `displayArtist` restores the original casing that normalization
        // lowercased, so a save yields "Aditya Rikhari - Ae Ajnabee.lrc" rather
        // than "aditya rikhari, ravator, kutle khan - Ae Ajnabee.lrc".
        const shownTitle = result.displayTitle || cleanField(fallbackTitle) || query.title;
        const shownArtist = result.displayArtist || cleanField(fallbackArtist) || query.artist;

        const file = buildLyricsFile(result, mode, shownTitle, shownArtist);
        if (!file) {
            return { success: false, error: `This track has no ${mode} lyrics to save.` };
        }

        const saved = await YtDlpNative.saveLyricsFile(file.filename, file.content, meta.platform ?? null);

        return { success: true, path: saved.filePath, fileName: saved.fileName };
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save the lyrics file.';
        return { success: false, error: message };
    }
}
