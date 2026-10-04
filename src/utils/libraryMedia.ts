/**
 * Pure helpers behind the gallery view.
 *
 * Kept out of the screen so the grouping, filtering and ordering rules can be
 * tested directly instead of being buried in render code, and so the same rules
 * can back both the grid and the selection count.
 */

export type MediaKind = 'video' | 'image' | 'audio' | 'text';

export type SortOrder = 'newest' | 'oldest' | 'largest' | 'name';

export type KindFilter = 'all' | MediaKind;

const VIDEO_EXT = ['mp4', 'webm', 'mkv', 'mov', 'avi', '3gp', 'm4v', 'ts'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic'];
const AUDIO_EXT = ['mp3', 'm4a', 'flac', 'aac', 'wav', 'ogg', 'opus'];
const TEXT_EXT = ['srt', 'vtt', 'ttml', 'lrc', 'txt'];

/**
 * Classifies a file by extension rather than by the folder it landed in.
 *
 * The native side derives `contentType` from which public directory was walked,
 * which mislabels a video saved under Pictures as an image. A gallery tile
 * showing a play badge or not depends entirely on getting this right.
 */
export function deriveMediaKind(extension: string): MediaKind {
    const ext = (extension || '').toLowerCase().replace(/^\./, '');
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (AUDIO_EXT.includes(ext)) return 'audio';
    if (TEXT_EXT.includes(ext)) return 'text';
    return 'image';
}

/** True when the extension is one we know how to preview in-app. */
export function isPreviewable(kind: MediaKind): boolean {
    return kind === 'video' || kind === 'image';
}

/**
 * Short duration label for a tile badge.
 *
 * Takes milliseconds because that is what the retriever reports, while the
 * existing `formatDuration` helper takes seconds. Returns null when there is no
 * usable timing so callers can hide the badge rather than render "0:00".
 */
export function formatTileDuration(durationMs?: number): string | null {
    if (!durationMs || durationMs < 0 || !Number.isFinite(durationMs)) return null;
    const total = Math.round(durationMs / 1000);
    if (total <= 0) return null;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;

/**
 * Buckets a timestamp for a section header, newest bucket first.
 *
 * `now` is a parameter rather than read from the clock so the result is
 * deterministic and testable.
 */
export function dateBucket(timestamp: number, now: number = Date.now()): string {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    if (timestamp >= startOfToday) return 'Today';
    if (timestamp >= startOfToday - DAY_MS) return 'Yesterday';
    if (timestamp >= startOfToday - 7 * DAY_MS) return 'This week';
    if (timestamp >= startOfToday - 30 * DAY_MS) return 'This month';
    return 'Earlier';
}

/** Order for the section headers, so Today never lands below Earlier. */
const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

export interface LibraryItem {
    name: string;
    path: string;
    size: number;
    modified: number;
    platform: string;
    extension: string;
    thumbnail?: string | null;
    duration?: number;
    mimeType?: string;
}

export interface GalleryFilters {
    kind: KindFilter;
    platform: string | null;
    query: string;
    sort: SortOrder;
}

export interface DateSection {
    title: string;
    data: LibraryItem[];
}

/**
 * Applies the active filters and ordering.
 *
 * Search matches the filename only. Matching on path as well would let a query
 * for "youtube" surface every download, since the platform folder name is part
 * of the path, which is not what someone typing a title fragment expects.
 */
export function filterAndSort(
    items: LibraryItem[],
    filters: GalleryFilters
): LibraryItem[] {
    const query = filters.query.trim().toLowerCase();
    const filtered = items.filter((item) => {
        if (filters.kind !== 'all' && deriveMediaKind(item.extension) !== filters.kind) {
            return false;
        }
        if (filters.platform && item.platform !== filters.platform) return false;
        if (query && !item.name.toLowerCase().includes(query)) return false;
        return true;
    });

    const sorted = [...filtered];
    switch (filters.sort) {
        case 'oldest':
            sorted.sort((a, b) => a.modified - b.modified);
            break;
        case 'largest':
            sorted.sort((a, b) => b.size - a.size);
            break;
        case 'name':
            // Numeric compare so "clip 2" sorts before "clip 10".
            sorted.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );
            break;
        case 'newest':
        default:
            sorted.sort((a, b) => b.modified - a.modified);
            break;
    }
    return sorted;
}

/**
 * Groups an already-sorted list into date sections.
 *
 * Sections are formed by walking the sorted list, so consecutive runs of the
 * same bucket merge naturally and empty buckets never appear. This is why the
 * caller must pass the result of [filterAndSort] in newest-first order.
 */
export function groupByDate(items: LibraryItem[], now: number = Date.now()): DateSection[] {
    const sections: DateSection[] = [];
    for (const item of items) {
        const title = dateBucket(item.modified, now);
        const last = sections[sections.length - 1];
        if (last && last.title === title) {
            last.data.push(item);
        } else {
            sections.push({ title, data: [item] });
        }
    }
    // Guard against a caller passing oldest-first, which would emit duplicate
    // sections for the same bucket instead of merging them.
    const seen = new Set<string>();
    for (const section of sections) {
        if (seen.has(section.title)) {
            section.data.sort((a, b) => b.modified - a.modified);
        } else {
            seen.add(section.title);
        }
    }
    return sections.sort(
        (a, b) => BUCKET_ORDER.indexOf(a.title) - BUCKET_ORDER.indexOf(b.title)
    );
}

/** Every platform present, alphabetically, for the platform filter chips. */
export function collectPlatforms(items: LibraryItem[]): string[] {
    const set = new Set<string>();
    for (const item of items) {
        if (item.platform && item.platform !== 'Unknown') set.add(item.platform);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Count per kind, used to label the filter chips so the user can see what is
 * available before switching.
 */
export function countByKind(items: LibraryItem[]): Record<KindFilter, number> {
    const counts: Record<KindFilter, number> = { all: 0, video: 0, image: 0, audio: 0, text: 0 };
    for (const item of items) {
        counts.all++;
        counts[deriveMediaKind(item.extension)]++;
    }
    return counts;
}

export const SORT_LABELS: Record<SortOrder, string> = {
    newest: 'Newest',
    oldest: 'Oldest',
    largest: 'Largest',
    name: 'Name',
};