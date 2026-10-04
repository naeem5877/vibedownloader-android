/**
 * State for the gallery view: loading, filtering, selection and thumbnails.
 *
 * Thumbnails are fetched lazily, a screenful at a time, because decoding a
 * poster frame for every download during the initial listing would stall the
 * screen on a library with hundreds of videos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { YtDlpNative, type BulkDeleteResult, type DownloadedFile } from '../native/YtDlpModule';
import {
    collectPlatforms,
    countByKind,
    filterAndSort,
    groupByDate,
    type GalleryFilters,
    type KindFilter,
    type LibraryItem,
    type SortOrder,
} from '../utils/libraryMedia';

const toItem = (file: DownloadedFile): LibraryItem => ({
    name: file.name,
    path: file.path,
    size: file.size,
    modified: file.modified,
    platform: file.platform,
    extension: file.extension || file.name.split('.').pop() || '',
    thumbnail: file.thumbnail,
    duration: file.duration,
    mimeType: file.mimeType,
});

export interface UseLibraryGallery {
    items: LibraryItem[];
    visible: LibraryItem[];
    sections: ReturnType<typeof groupByDate>;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    filters: GalleryFilters;
    setKind: (kind: KindFilter) => void;
    setPlatform: (platform: string | null) => void;
    setQuery: (query: string) => void;
    setSort: (sort: SortOrder) => void;
    resetFilters: () => void;
    platforms: string[];
    kindCounts: ReturnType<typeof countByKind>;
    hasActiveFilters: boolean;
    reload: () => Promise<void>;
    /** Paths whose poster has been requested, to avoid duplicate native calls. */
    thumbnails: Record<string, string | null>;
    requestThumbnail: (path: string) => void;
    selectionMode: boolean;
    selected: Set<string>;
    isSelected: (path: string) => boolean;
    toggleSelect: (path: string) => void;
    selectAll: () => void;
    clearSelection: () => void;
    selectedItems: LibraryItem[];
    deleteSelected: () => Promise<BulkDeleteResult | null>;
    deleting: boolean;
}

const DEFAULT_FILTERS: GalleryFilters = {
    kind: 'all',
    platform: null,
    query: '',
    sort: 'newest',
};

export function useLibraryGallery(): UseLibraryGallery {
    const [all, setAll] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_FILTERS);
    const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // In-flight thumbnail requests, so a fast scroll cannot fire the same
    // native decode several times before the first one resolves.
    const pending = useRef<Set<string>>(new Set());

    const load = useCallback(async (isRefresh: boolean) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const files = await YtDlpNative.listDownloadedFiles();
            const next = files.map(toItem);
            setAll(next);
            // Seed whatever thumbnails the listing already resolved, which
            // covers embedded artwork for audio and sidecar images for free.
            const seeded: Record<string, string | null> = {};
            for (const item of next) {
                if (item.thumbnail) seeded[item.path] = item.thumbnail;
            }
            setThumbnails(seeded);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read your library');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load(false);
    }, [load]);

    const visible = useMemo(() => filterAndSort(all, filters), [all, filters]);
    const sections = useMemo(() => groupByDate(visible), [visible]);
    const platforms = useMemo(() => collectPlatforms(all), [all]);
    const kindCounts = useMemo(() => countByKind(all), [all]);

    const requestThumbnail = useCallback(
        (path: string) => {
            if (thumbnails[path] !== undefined) return;
            if (pending.current.has(path)) return;
            pending.current.add(path);
            YtDlpNative.getMediaThumbnail?.(path)
                .then((uri) => {
                    setThumbnails((prev) => (prev[path] === undefined ? { ...prev, [path]: uri } : prev));
                })
                .catch(() => {
                    // A failed poster just leaves the icon tile in place, so
                    // record the miss to stop retrying it on every scroll.
                    setThumbnails((prev) => (prev[path] === undefined ? { ...prev, [path]: null } : prev));
                })
                .finally(() => pending.current.delete(path));
        },
        [thumbnails]
    );

    const toggleSelect = useCallback((path: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelected(new Set(visible.map((item) => item.path)));
    }, [visible]);

    const clearSelection = useCallback(() => setSelected(new Set()), []);

    const selectedItems = useMemo(
        () => all.filter((item) => selected.has(item.path)),
        [all, selected]
    );

    const deleteSelected = useCallback(async (): Promise<BulkDeleteResult | null> => {
        const paths = [...selected];
        if (paths.length === 0) return null;
        setDeleting(true);
        try {
            const result = await YtDlpNative.deleteFiles(paths);
            // Drop the deleted rows immediately rather than waiting for a
            // rescan, and clear their cached posters so a stale frame cannot
            // reappear if the same path is downloaded again.
            const gone = new Set(result.deleted);
            setAll((prev) => prev.filter((item) => !gone.has(item.path)));
            setThumbnails((prev) => {
                const next = { ...prev };
                for (const path of gone) delete next[path];
                return next;
            });
            setSelected(new Set());
            return result;
        } finally {
            setDeleting(false);
        }
    }, [selected]);

    const hasActiveFilters =
        filters.kind !== 'all' || filters.platform !== null || filters.query.trim() !== '';

    return {
        items: all,
        visible,
        sections,
        loading,
        refreshing,
        error,
        filters,
        setKind: (kind) => setFilters((f) => ({ ...f, kind })),
        setPlatform: (platform) => setFilters((f) => ({ ...f, platform })),
        setQuery: (query) => setFilters((f) => ({ ...f, query })),
        setSort: (sort) => setFilters((f) => ({ ...f, sort })),
        resetFilters: () => setFilters(DEFAULT_FILTERS),
        platforms,
        kindCounts,
        hasActiveFilters,
        reload: () => load(true),
        thumbnails,
        requestThumbnail,
        selectionMode: selected.size > 0,
        selected,
        isSelected: (path: string) => selected.has(path),
        toggleSelect,
        selectAll,
        clearSelection,
        selectedItems,
        deleteSelected,
        deleting,
    };
}