import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { YtDlpNative, ytDlpEventEmitter } from '../native/YtDlpModule';
import { StoryNative } from '../native/StoryModule';
import { isYouTubeMusicUrl, getYouTubeMusicAlbumArt } from '../services/YouTubeMusicService';
import { normalizeUrl } from '../utils/batchUrls';

export type QueueItemStatus = 'waiting' | 'downloading' | 'done' | 'failed' | 'cancelled';

/** SnapSave resolves stories to its own CDN; yt-dlp cannot read those urls. */
const isSnapSaveUrl = (url: string) => url.includes('d.rapidcdn.app/');

const STORAGE_KEY = '@vibe_download_queue_v1';

/** A single hung yt-dlp would otherwise block every later item forever. */
const ITEM_TIMEOUT_MS = 10 * 60 * 1000;

/** Total attempts per item, including the first. Mirrors the desktop subtitle retry budget. */
const MAX_ATTEMPTS = 3;

/** Linear backoff between automatic retries. */
const RETRY_BACKOFF_MS = 4000;

/** Pause between items so we are not hammering the resolver on tight loops. */
const INTER_ITEM_DELAY_MS = 800;

export interface QueueItem {
    id: string;
    title: string;
    author: string;
    thumbnail?: string;
    url: string;
    type: 'youtube' | 'spotify' | string;
    searchQuery?: string;
    formatId: string | null;
    /**
     * The YouTube player client that produced `formatId`. Format ids are
     * client-specific, so the native download has to request the same one.
     */
    playerClient?: string;
    status: QueueItemStatus;
    progress: number;
    eta: number;
    errorMessage?: string;
    cookies?: string;
    album?: string;
    /** 'image' | 'video' for stories, so the native side can pick a container. */
    storyType?: 'image' | 'video';
    /** How many tries this item has had, so retries stop somewhere sensible. */
    attempts?: number;
}

export interface QueueStats {
    total: number;
    done: number;
    failed: number;
    waiting: number;
    cancelled: number;
    active: QueueItem | null;
    /** Percentage across the whole batch, counting the in-flight item's progress. */
    overallPercent: number;
    /** True once nothing is left that could still run. */
    isFinished: boolean;
}

interface UseDownloadQueueReturn {
    queue: QueueItem[];
    isQueueRunning: boolean;
    isPaused: boolean;
    totalDone: number;
    totalFailed: number;
    stats: QueueStats;
    addToQueue: (items: Omit<QueueItem, 'id' | 'status' | 'progress' | 'eta'>[], formatId: string | null) => { added: number; duplicates: number };
    cancelItem: (id: string) => void;
    cancelAll: () => void;
    clearQueue: () => void;
    retryItem: (id: string) => void;
    retryFailed: () => void;
    pause: () => void;
    resume: () => void;
}

const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Only the fields worth restoring. Progress and transient status are dropped. */
type PersistedItem = Omit<QueueItem, 'progress' | 'eta' | 'status'> & { status?: QueueItemStatus };

export const useDownloadQueue = (): UseDownloadQueueReturn => {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isQueueRunning, setIsQueueRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const processingRef = useRef(false);
    const pausedRef = useRef(false);
    /** Ids the user explicitly cancelled; never picked up again. */
    const cancelledIds = useRef<Set<string>>(new Set());
    /** Item currently being downloaded, so only it can be aborted. */
    const activeItemRef = useRef<{ itemId: string; processId: string } | null>(null);

    const queueRef = useRef<QueueItem[]>(queue);
    useEffect(() => { queueRef.current = queue; }, [queue]);

    /** Guards against a stale-closure finish when the component unmounts. */
    const aliveRef = useRef(true);
    useEffect(() => () => { aliveRef.current = false; }, []);

    const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
        if (!aliveRef.current) return;
        setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
    }, []);

    // ── Persistence ───────────────────────────────────────────────────────────
    // The queue survives an app kill so a long batch is not lost when Android
    // reclaims the process while the user is in another app.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (!raw || cancelled) return;
                const parsed = JSON.parse(raw) as PersistedItem[];
                if (!Array.isArray(parsed) || parsed.length === 0 || cancelled) return;

                const restored: QueueItem[] = parsed.map(item => {
                    // Anything that was mid-flight when we died is gone, not
                    // resumable. Mark it failed so it is visible and retryable
                    // instead of silently looking like it is still running.
                    const interrupted = item.status === 'downloading';
                    const status: QueueItemStatus = interrupted
                        ? 'failed'
                        : (item.status ?? 'waiting');
                    return {
                        ...item,
                        status,
                        progress: 0,
                        eta: 0,
                        attempts: item.attempts ?? 0,
                        errorMessage: interrupted
                            ? 'Interrupted when the app closed'
                            : item.errorMessage,
                    } as QueueItem;
                });
                if (cancelled) return;
                setQueue(restored);
                // Do not auto-start: resuming a batch silently would spend
                // mobile data. The user presses Resume.
                pausedRef.current = true;
                setIsPaused(true);
            } catch {
                // Corrupt payload: start clean rather than crash on launch.
                try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Persist on every meaningful change. Progress is left out so a fast
    // download does not thrash storage.
    useEffect(() => {
        if (queue.length === 0) {
            AsyncStorage.removeItem(STORAGE_KEY).catch(() => { });
            return;
        }
        // Listed field by field on purpose: progress and eta must never be
        // persisted so a fast download does not thrash storage, and a restored
        // item always restarts from zero.
        const payload: PersistedItem[] = queue.map((item): PersistedItem => ({
            id: item.id,
            title: item.title,
            author: item.author,
            thumbnail: item.thumbnail,
            url: item.url,
            type: item.type,
            searchQuery: item.searchQuery,
            formatId: item.formatId,
            errorMessage: item.errorMessage,
            cookies: item.cookies,
            album: item.album,
            storyType: item.storyType,
            attempts: item.attempts,
            status: item.status,
        }));
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => { });
    }, [queue]);

    // ── Core loop ─────────────────────────────────────────────────────────────
    const runItem = useCallback(async (item: QueueItem): Promise<void> => {
        const processId = generateId();
        activeItemRef.current = { itemId: item.id, processId };
        updateItem(item.id, { status: 'downloading', progress: 0, errorMessage: undefined });

        const subscription = ytDlpEventEmitter.addListener('onDownloadProgress', (event: any) => {
            if (activeItemRef.current?.processId !== processId) return;
            updateItem(item.id, {
                progress: Math.max(0, Math.min(event.progress || 0, 100)),
                eta: event.eta || 0,
            });
        });

        // A timeout has to be armed around the whole await, otherwise one stuck
        // resolver silently freezes the rest of the batch forever.
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            YtDlpNative.cancelDownload(processId).catch(() => { });
        }, ITEM_TIMEOUT_MS);

        try {
            if (cancelledIds.current.has(item.id)) {
                updateItem(item.id, { status: 'cancelled' });
                return;
            }

            if (item.type === 'spotify' && item.searchQuery) {
                await YtDlpNative.downloadSpotifyTrack(
                    item.searchQuery, item.title, item.author,
                    item.album || 'Unknown', item.thumbnail || null, processId
                );
            } else if (StoryNative && isSnapSaveUrl(item.url)) {
                // SnapSave stories stream straight to public storage.
                await StoryNative.downloadStory(
                    item.url, item.type, item.author || '', item.storyType || 'video', processId
                );
            } else {
                let thumbnailPath: string | undefined;

                if (isYouTubeMusicUrl(item.url)) {
                    try {
                        const art = await getYouTubeMusicAlbumArt(item.url);
                        if (art?.url) {
                            thumbnailPath = await YtDlpNative.downloadThumbnailToCache(art.url);
                        }
                    } catch (e) {
                        console.warn('[useDownloadQueue] YT Music art fetch failed (ignoring):', e);
                    }
                }

                await YtDlpNative.download(item.url, item.formatId, processId, {
                    title: item.title,
                    artist: item.author,
                    platform: item.type,
                    cookies: item.cookies || undefined,
                    thumbnailPath,
                    playerClient: item.playerClient || undefined,
                } as any);
            }

            if (cancelledIds.current.has(item.id)) {
                updateItem(item.id, { status: 'cancelled' });
            } else {
                updateItem(item.id, { status: 'done', progress: 100, eta: 0 });
            }
        } catch (error: any) {
            if (cancelledIds.current.has(item.id) || error?.code === 'CANCELLED') {
                updateItem(item.id, { status: 'cancelled' });
                return;
            }
            const attempts = (item.attempts ?? 0) + 1;
            if (timedOut) {
                updateItem(item.id, {
                    status: attempts < MAX_ATTEMPTS ? 'waiting' : 'failed',
                    attempts,
                    errorMessage: attempts < MAX_ATTEMPTS
                        ? `Timed out, retrying (${attempts}/${MAX_ATTEMPTS})`
                        : 'Timed out',
                });
            } else {
                updateItem(item.id, {
                    status: attempts < MAX_ATTEMPTS ? 'waiting' : 'failed',
                    attempts,
                    errorMessage: attempts < MAX_ATTEMPTS
                        ? `Retrying (${attempts}/${MAX_ATTEMPTS}): ${error?.message || 'Download failed'}`
                        : (error?.message || 'Download failed'),
                });
            }
        } finally {
            clearTimeout(timer);
            subscription.remove();
            if (activeItemRef.current?.processId === processId) {
                activeItemRef.current = null;
            }
        }
    }, [updateItem]);

    const processQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        if (!aliveRef.current) { processingRef.current = false; return; }
        setIsQueueRunning(true);

        try {
            while (aliveRef.current && !pausedRef.current) {
                const nextItem = queueRef.current.find(
                    i => i.status === 'waiting' && !cancelledIds.current.has(i.id)
                );
                if (!nextItem) break;

                await runItem(nextItem);

                // Back off before the next attempt of a retried item, or before
                // the next item when it succeeded.
                if (aliveRef.current && !pausedRef.current) {
                    const stillRetrying = queueRef.current.some(
                        i => i.id === nextItem.id && i.status === 'waiting'
                    );
                    await delay(stillRetrying ? RETRY_BACKOFF_MS : INTER_ITEM_DELAY_MS);
                }
            }
        } finally {
            processingRef.current = false;
            if (aliveRef.current) setIsQueueRunning(false);
        }
    }, [runItem]);

    // Pick up work whenever something is waiting and we are not paused.
    useEffect(() => {
        if (pausedRef.current) return;
        const hasWaiting = queue.some(i => i.status === 'waiting' && !cancelledIds.current.has(i.id));
        if (hasWaiting && !processingRef.current) {
            processQueue();
        }
    }, [queue, processQueue]);

    // ── Public actions ────────────────────────────────────────────────────────
    const addToQueue = useCallback((
        items: Omit<QueueItem, 'id' | 'status' | 'progress' | 'eta'>[],
        formatId: string | null
    ) => {
        const existing = new Set(queueRef.current.map(i => normalizeUrl(i.url)).filter(Boolean));
        const fresh: QueueItem[] = [];
        let duplicates = 0;

        for (const item of items) {
            const key = normalizeUrl(item.url);
            // Guard against the same link being queued twice, which otherwise
            // writes two files to the same output path.
            if (key && existing.has(key)) { duplicates++; continue; }
            if (key) existing.add(key);
            fresh.push({
                ...item,
                id: generateId(),
                formatId,
                status: 'waiting',
                progress: 0,
                eta: 0,
                attempts: 0,
            });
        }

        if (fresh.length > 0) {
            // A manual add always counts as an explicit go-ahead.
            pausedRef.current = false;
            setIsPaused(false);
            setQueue(prev => [...prev, ...fresh]);
        }
        return { added: fresh.length, duplicates };
    }, []);

    const cancelItem = useCallback((id: string) => {
        cancelledIds.current.add(id);
        // Only abort when the item being cancelled is the one actually
        // running. Aborting unconditionally would kill an unrelated download
        // whenever a queued item was removed.
        if (activeItemRef.current?.itemId === id) {
            const { processId } = activeItemRef.current;
            YtDlpNative.cancelDownload(processId).catch(() => { });
        }
        updateItem(id, { status: 'cancelled' });
    }, [updateItem]);

    const cancelAll = useCallback(() => {
        const active = activeItemRef.current;
        if (active) {
            cancelledIds.current.add(active.itemId);
            YtDlpNative.cancelDownload(active.processId).catch(() => { });
        }
        setQueue(prev => prev.map(item => {
            if (item.status === 'waiting' || item.status === 'downloading') {
                cancelledIds.current.add(item.id);
                return { ...item, status: 'cancelled' };
            }
            return item;
        }));
    }, []);

    const clearQueue = useCallback(() => {
        const active = activeItemRef.current;
        if (active) {
            YtDlpNative.cancelDownload(active.processId).catch(() => { });
        }
        // Drop the id tombstones too, otherwise they grow without bound.
        cancelledIds.current.clear();
        setQueue([]);
    }, []);

    const retryItem = useCallback((id: string) => {
        cancelledIds.current.delete(id);
        pausedRef.current = false;
        setIsPaused(false);
        updateItem(id, { status: 'waiting', progress: 0, eta: 0, attempts: 0, errorMessage: undefined });
    }, [updateItem]);

    const retryFailed = useCallback(() => {
        setQueue(prev => {
            const targets = prev.filter(i => i.status === 'failed' || i.status === 'cancelled');
            if (targets.length === 0) return prev;
            const ids = new Set(targets.map(i => i.id));
            ids.forEach(id => cancelledIds.current.delete(id));
            pausedRef.current = false;
            setIsPaused(false);
            return prev.map(i => (ids.has(i.id)
                ? { ...i, status: 'waiting' as QueueItemStatus, progress: 0, eta: 0, attempts: 0, errorMessage: undefined }
                : i));
        });
    }, []);

    const pause = useCallback(() => {
        pausedRef.current = true;
        setIsPaused(true);
    }, []);

    const resume = useCallback(() => {
        pausedRef.current = false;
        setIsPaused(false);
        // Revive anything cancelled or failed so resume means "carry on".
        setQueue(prev => {
            const revivable = prev.filter(i => i.status === 'cancelled');
            if (revivable.length === 0) return prev;
            const ids = new Set(revivable.map(i => i.id));
            ids.forEach(id => cancelledIds.current.delete(id));
            return prev.map(i => (ids.has(i.id) ? { ...i, status: 'waiting' as QueueItemStatus, progress: 0, eta: 0 } : i));
        });
        processQueue();
    }, [processQueue]);

    // ── Derived stats ─────────────────────────────────────────────────────────
    const totalDone = queue.filter(i => i.status === 'done').length;
    const totalFailed = queue.filter(i => i.status === 'failed').length;

    const stats = (() => {
        const total = queue.length;
        const waiting = queue.filter(i => i.status === 'waiting').length;
        const cancelled = queue.filter(i => i.status === 'cancelled').length;
        const active = queue.find(i => i.status === 'downloading') || null;
        const settled = totalDone + totalFailed + cancelled;
        // `progress` is on a 0-100 scale while `settled` counts whole items,
        // so the active item has to be converted to a fraction before being
        // added to the count, otherwise the bar reads far over 100%.
        const activeFraction = (active?.progress ?? 0) / 100;
        const overallPercent = total === 0
            ? 0
            : Math.min(100, Math.max(0, Math.round(((settled + activeFraction) / total) * 100)));
        return {
            total,
            done: totalDone,
            failed: totalFailed,
            waiting,
            cancelled,
            active,
            overallPercent,
            isFinished: total > 0 && settled === total && active === null,
        };
    })();

    return {
        queue,
        isQueueRunning,
        isPaused,
        totalDone,
        totalFailed,
        stats,
        addToQueue,
        cancelItem,
        cancelAll,
        clearQueue,
        retryItem,
        retryFailed,
        pause,
        resume,
    };
};
