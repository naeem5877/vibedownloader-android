/**
 * Lyrics orchestrator: one track in, a best-effort combined result out.
 *
 * The two providers are fully independent. Each has its own timeout, and a
 * failure in one never suppresses the other - NetEase being unreachable still
 * leaves LRCLIB's plain and line-synced lyrics intact, and vice versa. That is
 * the reason for running them concurrently rather than in sequence: a hung
 * provider costs its own budget and nothing else.
 *
 * The other rule is that `null` means "render nothing". There is no empty
 * success: if neither provider produced readable lyrics the result is `null`,
 * and the panel is never mounted. Wrong lyrics are worse than no lyrics.
 */

import type { LyricsResult, LyricsQuery } from './types';
import { isEmpty } from './types';
import { fetchLrclib } from './lrclib';
import { fetchNetease } from './netease';
import { normalizeTitle, normalizeArtist, cleanArtist, titleCandidates, titleCredits, isVariantTitle } from './normalize';
import { displayTitle, displayArtist } from './format';

/**
 * Strip variant suffix from a title so we can do a base-title search.
 * "Sunflower (Remix)" → "Sunflower"
 * "Shape of You (Galantis Extended Remix)" → "Shape of You"
 */
function stripVariantSuffix(raw: string): string {
    // Remove trailing parenthetical/bracketed variant markers
    return raw
        .replace(/\s*[\[(][^\])"']*\b(?:remix(?:ed|es)?|acoustic|live|unplugged|cover(?:ed)?|karaoke|instrumental|version|edit(?:ed)?|mix(?:ed)?|extended|rework(?:ed)?|remaster(?:ed)?|reissue|demo|sped|slowed|reverb|vip|reprise)\b[^\])"']*[\])]/gi, '')
        .replace(/\s*\b-\s*(?:remix|acoustic|live|unplugged|instrumental|extended|remaster(?:ed)?)\b.*/gi, '')
        .trim();
}

/** Per-provider budget. A hung provider must not stall the download panel. */
const PROVIDER_TIMEOUT_MS = 5000;

/** The whole lookup stops looking before the caller's own budget expires. */
const ATTEMPT_BUDGET_MS = 9_000;

/**
 * Upper bound on provider round trips for one track.
 */
const MAX_ATTEMPTS = 8;

/**
 * The (title, artist) pairs to try, in order.
 *
 * In YouTube music, titles often follow "Artist - Title" (Ed Sheeran - Shape of You).
 * We construct smart attempts prioritizing exact pairs, cleaned artist names,
 * and both dash partition possibilities.
 */
function buildAttempts(query: LyricsQuery, artist: string, credits: string) {
    const titles = titleCandidates(query.title);
    const cleanedArtist = cleanArtist(query.artist);
    const artists: string[] = [];
    const addArtist = (a: string) => {
        const norm = normalizeArtist(a);
        if (norm && !artists.includes(norm)) artists.push(norm);
    };

    if (artist) addArtist(artist);
    if (cleanedArtist) addArtist(cleanedArtist);
    if (credits) addArtist(credits);

    const attempts: Array<{ title: string; artist: string }> = [];
    const addAttempt = (t: string, a: string) => {
        const title = normalizeTitle(t);
        const art = normalizeArtist(a);
        if (title && art && !attempts.some((x) => x.title === title && x.artist === art)) {
            attempts.push({ title, artist: art });
        }
    };

    // If the title contains a dash (Artist - Title), prioritizing (partB, partA) is critical!
    const withoutChannel = query.title.split('|')[0];
    const dashMatch = withoutChannel.match(/\s+[-–—]\s+/);
    if (dashMatch && dashMatch.index !== undefined) {
        const partA = withoutChannel.slice(0, dashMatch.index).trim();
        const partB = withoutChannel.slice(dashMatch.index + dashMatch[0].length).trim();
        // Artist - Title:
        addAttempt(partB, partA);
        if (cleanedArtist || artist) addAttempt(partB, cleanedArtist || artist);
        // Title - Artist:
        addAttempt(partA, partB);
        if (cleanedArtist || artist) addAttempt(partA, cleanedArtist || artist);
    }

    for (const title of titles) {
        for (const a of artists) {
            addAttempt(title, a);
        }
    }

    // If the query title itself is a variant (e.g. "Sunflower (Remix)"), also try
    // searching for the base title without the variant suffix. LRCLIB has the
    // variant catalogued by its actual name, but the isVariantTitle guard on the
    // candidate side blocks matches when the query already carries the marker.
    // Searching under the stripped title (e.g. "Sunflower") finds candidates whose
    // track name exactly matches, and those candidates pass the guard because
    // "Sunflower" alone contains no variant marker.
    if (isVariantTitle(query.title)) {
        const stripped = stripVariantSuffix(query.title);
        if (stripped && stripped !== query.title) {
            for (const a of artists) {
                addAttempt(stripped, a);
            }
        }
    }

    return attempts.slice(0, MAX_ATTEMPTS);
}

/**
 * Look up lyrics for one track.
 *
 * Never throws. Every failure path resolves to `null`, because the caller is a
 * screen asking a question it is happy to get no answer to.
 */
export async function getLyrics(query: LyricsQuery): Promise<LyricsResult | null> {
    const artist = normalizeArtist(query.artist);
    const attempts = buildAttempts(query, artist, titleCredits(query.title));
    if (!attempts.length) return null;

    const startedAt = Date.now();

    for (const attempt of attempts) {
        // Retries are a bonus, never a reason to overrun the caller's budget.
        if (Date.now() - startedAt > ATTEMPT_BUDGET_MS) return null;

        const normalized: LyricsQuery = {
            title: attempt.title,
            artist: attempt.artist,
            duration: query.duration
        };

        const [lrclib, netease] = await Promise.all([
            fetchLrclib(normalized, PROVIDER_TIMEOUT_MS).catch(() => null),
            fetchNetease(normalized, PROVIDER_TIMEOUT_MS).catch(() => null)
        ]);

        // `title`/`artist` below are the strings that *matched*, which is what
        // makes the result reproducible. `displayTitle`/`displayArtist` are what
        // a person should read, derived from the caller's original metadata
        // rather than the candidate - a header must never show
        // "Ae Ajnabee (Official Music Video) - Aditya Rikhari, Ravator | Coke
        // Studio Bharat".
        const result: LyricsResult = {
            title: attempt.title,
            artist: attempt.artist,
            displayTitle: displayTitle(query.title, query.artist),
            displayArtist: displayArtist(query.artist),
            duration: query.duration,
            sources: {}
        };

        if (lrclib) {
            if (lrclib.plain) {
                result.plain = lrclib.plain;
                result.sources.plain = 'lrclib';
            }
            if (lrclib.synced) {
                result.synced = lrclib.synced;
                result.sources.synced = 'lrclib';
            }
        }

        if (netease) {
            if (netease.words) {
                result.words = netease.words;
                result.sources.words = 'netease';
            }
            if (netease.translation) {
                result.translation = netease.translation;
                result.sources.translation = 'netease';
            }
        }

        // Derive line-synced lyrics from word-synced lyrics if LRCLIB didn't have synced
        if (!result.synced && result.words?.length) {
            result.synced = result.words.map((l) => ({ t: l.t, text: l.text }));
            result.sources.synced = 'netease';
        }

        // Derive plain lyrics from synced or word-synced if LRCLIB didn't have plain
        if (!result.plain && (result.synced?.length || result.words?.length)) {
            const fallback = result.synced || result.words || [];
            result.plain = fallback.map((l) => l.text).join('\n');
            result.sources.plain = result.sources.synced || result.sources.words || 'netease';
        }

        // Nothing readable: fall through and try a cleaner title or artist.
        if (isEmpty(result)) continue;

        return result;
    }

    // Nothing readable from any attempt: report no result at all.
    return null;
}
