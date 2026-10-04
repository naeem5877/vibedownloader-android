/**
 * Timeline parsers for the two lyric formats the providers publish.
 *
 * LRCLIB's `syncedLyrics` is standard LRC, and NetEase's `tlyric` uses the same
 * shape, so one parser covers both. NetEase's `yrc` is a different format with
 * per-word timings and needs its own.
 *
 * Both parsers are total: malformed input yields fewer lines or an empty array,
 * never a throw. A provider returning junk must not take down the panel.
 */

import type { LyricLine, SubtitleCue, WordTiming } from './types';

/**
 * A single LRC timestamp: `[mm:ss.xx]`, `[mm:ss:xxx]` or `[mm:ss]`.
 *
 * The separator decides how the fraction is read, and the two are not
 * interchangeable: `.` denotes hundredths (`.50` = 500ms, `.5` = 500ms) while
 * `:` denotes milliseconds (`:500` = 500ms, `:5` = 5ms). Treating them the same
 * shifts every colon-style line by up to a second, which desyncs the highlight
 * from the audio. Captured separately so `parseLrc` can scale by separator.
 */
const LRC_TAG = /\[(\d{1,3}):(\d{1,2})(?:([.:])(\d{1,3}))?\]/g;

/**
 * Parse LRC into ordered lines.
 *
 * Handles the multi-timestamp form (`[00:10.00][01:20.00] repeated line`), which
 * LRC uses for a chorus that appears twice, by emitting one line per stamp.
 * Fractional digits are scaled by position, so `.5` is 500ms and `.50` is also
 * 500ms rather than 50ms.
 *
 * A `[ar:]`-style metadata tag carries no timestamp and is skipped.
 */
export function parseLrc(raw: string): LyricLine[] {
    if (!raw) return [];

    const out: LyricLine[] = [];

    for (const rawLine of raw.split(/\r?\n/)) {
        LRC_TAG.lastIndex = 0;

        const stamps: number[] = [];
        let textStart = 0;
        let match: RegExpExecArray | null;

        // Consume the leading run of timestamps; whatever follows is the text.
        while ((match = LRC_TAG.exec(rawLine)) !== null) {
            if (match.index !== textStart) break;
            const [, mm, ss, sep, frac] = match;
            const minutes = parseInt(mm, 10);
            const seconds = parseInt(ss, 10);

            let millis = 0;
            if (frac) {
                if (sep === '.') {
                    // Hundredths: keep two digits and scale to milliseconds.
                    // `.5`/`.05` -> 500/50ms, and a third digit is ignored
                    // rather than overflowing into a full extra second.
                    millis = parseInt(frac.slice(0, 2).padEnd(2, '0'), 10) * 10;
                } else {
                    // Already milliseconds - use verbatim, no padding.
                    millis = parseInt(frac, 10);
                }
            }

            stamps.push(minutes * 60_000 + seconds * 1_000 + millis);
            textStart = LRC_TAG.lastIndex;
        }

        if (stamps.length === 0) continue;

        const text = rawLine.slice(textStart).trim();
        // A bare timestamp with no text is a spacer, not a lyric.
        if (!text) continue;

        for (const t of stamps) out.push({ t, text });
    }

    return out.sort((a, b) => a.t - b.t);
}

/**
 * Parse NetEase `yrc` into lines that carry per-word timings.
 *
 * Format: `[lineStart,lineDuration](wordStart,wordDuration,0)word(wordStart,...)word`
 *
 * English is segmented per word, CJK per character. Timings are milliseconds and
 * are absolute within the track, not offsets from the line.
 *
 * Lines whose start is negative are credit metadata - `{"t":-1000,...}` renders
 * as a fake line at -1s - and are dropped. Without this the panel shows
 * `作词:` as a lyric that appears before the song starts.
 */
export function parseYrc(raw: string): LyricLine[] {
    if (!raw) return [];

    const out: LyricLine[] = [];

    for (const rawLine of raw.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const lineStamp = line.match(/^\[(-?\d+)\s*,\s*(\d+)\]/);
        if (!lineStamp) continue;

        const lineStart = parseInt(lineStamp[1], 10);
        // Negative start is a credit line, not a lyric.
        if (lineStart < 0) continue;

        // Clean natural text directly from the line by removing timestamp tags
        const cleanText = line
            .replace(/^\[-?\d+\s*,\s*\d+\]/, '')
            .replace(/\(\d+\s*,\s*\d+\s*,\s*\d+\)/g, '')
            .trim();

        const words: WordTiming[] = [];
        const wordRe = /\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)([^(]*)/g;
        let m: RegExpExecArray | null;

        while ((m = wordRe.exec(line)) !== null) {
            const rawW = m[4];
            if (!rawW && rawW !== ' ') continue;
            words.push({
                t: parseInt(m[1], 10),
                d: parseInt(m[2], 10),
                w: rawW
            });
        }

        if (words.length === 0) continue;

        // Use natural clean line text; fallback to joined words if cleanText was empty
        const text = cleanText || words.map((w) => w.w).join('');
        out.push({ t: lineStart, text, words });
    }

    return out.sort((a, b) => a.t - b.t);
}

/**
 * True when a parsed timeline is worth showing.
 *
 * Rejects a single-line result, which in practice means the provider echoed a
 * title or an error string into the lyric field rather than real content.
 */
export function isUsableTimeline(lines: LyricLine[] | undefined): boolean {
    return Array.isArray(lines) && lines.length >= 1;
}

/**
 * A subtitle timestamp: `00:00:02,500` (SRT) or `00:00:02.500` (WebVTT).
 *
 * SRT separates milliseconds with a comma, WebVTT with a dot, and both allow the
 * hours field to be omitted (`00:02.500`). The separator is normalised first so
 * one pattern covers the three spellings.
 */
const CUE_TIME = /(\d{1,2}:)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;

/** Converts a matched `CUE_TIME` into milliseconds. */
function cueTimeToMs(match: RegExpExecArray): number {
    const [, hh, mm, ss, frac] = match;
    const hours = hh ? parseInt(hh, 10) : 0;
    const minutes = parseInt(mm, 10);
    const seconds = parseInt(ss, 10);
    // `.5` means 500ms, not 5ms - scale by digit count, as parseLrc does.
    const ms = parseInt(frac, 10) * Math.pow(10, 3 - frac.length);
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

/**
 * Parses SubRip (`.srt`) cues.
 *
 * A cue is an optional numeric index line, a `start --> end` line, then one or
 * more text lines. The index is skipped rather than trusted because real-world
 * files frequently renumber or omit it.
 */
export function parseSrt(raw: string): SubtitleCue[] {
    if (!raw) return [];

    const cues: SubtitleCue[] = [];
    // Split on blank lines; SRT uses \n\n between cues, sometimes with trailing
    // spaces, so the separator tolerates surrounding whitespace.
    for (const block of raw.split(/\r?\n[ \t]*\r?\n/)) {
        const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length === 0) continue;

        const arrowAt = lines.findIndex((l) => l.includes('-->'));
        if (arrowAt === -1) continue; // index-only or malformed block

        const [rawStart, rawRest = ''] = lines[arrowAt].split('-->');
        const startMatch = CUE_TIME.exec(rawStart);
        const endMatch = CUE_TIME.exec(rawRest);
        if (!startMatch || !endMatch) continue;

        const text = lines
            .slice(arrowAt + 1)
            .join('\n')
            .replace(/<[^>]+>/g, '') // strip <i>, <b>, ruby/pos tags
            .trim();
        if (!text) continue;

        cues.push({
            start: cueTimeToMs(startMatch),
            end: cueTimeToMs(endMatch),
            text,
        });
    }

    return cues.sort((a, b) => a.start - b.start);
}

/**
 * Parses WebVTT (`.vtt`) cues.
 *
 * Beyond SubRip it has a `WEBVTT` header, optional cue identifiers, and
 * `NOTE`/`STYLE`/`REGION` blocks whose contents must not become cue text. Cue
 * settings trailing the end timestamp (`align:start position:10%`) are dropped.
 */
export function parseVtt(raw: string): SubtitleCue[] {
    if (!raw) return [];

    // Strip the header and metadata blocks, keeping blank-line block structure.
    const body = raw.replace(/^﻿?WEBVTT[^\n]*\n?/, '');
    const cues: SubtitleCue[] = [];

    for (const block of body.split(/\r?\n[ \t]*\r?\n/)) {
        const trimmed = block.trim();
        // NOTE / STYLE / REGION blocks are metadata, never dialogue.
        if (!trimmed || /^(NOTE|STYLE|REGION)\b/.test(trimmed)) continue;
        if (trimmed.startsWith('<!--')) continue;

        const lines = trimmed.split(/\r?\n/);
        const arrowAt = lines.findIndex((l) => l.includes('-->'));
        if (arrowAt === -1) continue;

        const [rawStart, rawRest = ''] = lines[arrowAt].split('-->');
        const startMatch = CUE_TIME.exec(rawStart);
        const endMatch = CUE_TIME.exec(rawRest);
        if (!startMatch || !endMatch) continue;

        const text = lines
            .slice(arrowAt + 1)
            .join('\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
        if (!text) continue;

        cues.push({
            start: cueTimeToMs(startMatch),
            end: cueTimeToMs(endMatch),
            text,
        });
    }

    return cues.sort((a, b) => a.start - b.start);
}

/**
 * Turns an LRC timeline into cues by borrowing each line's start as the next
 * line's end. The final cue is given a short nominal duration so it is not
 * rendered as a zero-length flash.
 */
export function lyricLinesToCues(lines: LyricLine[]): SubtitleCue[] {
    return lines.map((line, i) => {
        const next = lines[i + 1];
        const end = next && next.t > line.t ? next.t : line.t + 4000;
        return { start: line.t, end, text: line.text };
    });
}
