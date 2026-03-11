import { useState, useCallback, useRef, useEffect } from 'react';
import { YtDlpNative, ytDlpEventEmitter } from '../native/YtDlpModule';

export type QueueItemStatus = 'waiting' | 'downloading' | 'done' | 'failed' | 'cancelled';

export interface QueueItem {
    id: string;
    title: string;
    author: string;
    thumbnail?: string;
    url: string;
    type: 'youtube' | 'spotify' | string;
    searchQuery?: string;
    formatId: string | null;
    status: QueueItemStatus;
    progress: number;
    eta: number;
    errorMessage?: string;
}

interface UseDownloadQueueReturn {
    queue: QueueItem[];
    isQueueRunning: boolean;
    totalDone: number;
    totalFailed: number;
    addToQueue: (items: Omit<QueueItem, 'id' | 'status' | 'progress' | 'eta'>[], formatId: string | null) => void;
    cancelItem: (id: string) => void;
    cancelAll: () => void;
    clearQueue: () => void;
    retryFailed: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useDownloadQueue = (): UseDownloadQueueReturn => {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isQueueRunning, setIsQueueRunning] = useState(false);
    const processingRef = useRef(false);
    const cancelledIds = useRef<Set<string>>(new Set());
    const activeProcessId = useRef<string | null>(null);

    const totalDone = queue.filter(i => i.status === 'done').length;
    const totalFailed = queue.filter(i => i.status === 'failed').length;

    // Update a single item in queue
    const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const queueRef = useRef(queue);
    useEffect(() => { queueRef.current = queue; }, [queue]);

    // Process queue sequentially - one at a time
    const processQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        setIsQueueRunning(true);

        try {
            while (true) {
                // Always find the next waiting item using the latest ref
                const nextItem = queueRef.current.find(i => i.status === 'waiting' && !cancelledIds.current.has(i.id));

                if (!nextItem) break;

                // Set as downloading
                updateItem(nextItem.id, { status: 'downloading', progress: 0 });

                const processId = generateId();
                activeProcessId.current = processId;

                // Listen to progress for this specific processId
                const progressSubscription = ytDlpEventEmitter.addListener(
                    'onDownloadProgress',
                    (event: any) => {
                        if (event.processId === processId) {
                            const clamped = Math.max(0, Math.min(event.progress || 0, 100));
                            updateItem(nextItem.id, {
                                progress: clamped,
                                eta: event.eta || 0,
                            });
                        }
                    }
                );

                try {
                    // Pre-flight cancellation check
                    if (cancelledIds.current.has(nextItem.id)) {
                        updateItem(nextItem.id, { status: 'cancelled' });
                        progressSubscription.remove();
                        continue;
                    }

                    if (nextItem.type === 'spotify' && nextItem.searchQuery) {
                        await YtDlpNative.downloadSpotifyTrack(
                            nextItem.searchQuery,
                            nextItem.title,
                            nextItem.author,
                            nextItem.thumbnail || null,
                            processId
                        );
                    } else {
                        await YtDlpNative.download(nextItem.url, nextItem.formatId, processId);
                    }

                    updateItem(nextItem.id, { status: 'done', progress: 100 });
                } catch (error: any) {
                    if (cancelledIds.current.has(nextItem.id) || error?.code === 'CANCELLED') {
                        updateItem(nextItem.id, { status: 'cancelled' });
                    } else {
                        updateItem(nextItem.id, {
                            status: 'failed',
                            errorMessage: error?.message || 'Download failed',
                        });
                    }
                } finally {
                    progressSubscription.remove();
                    activeProcessId.current = null;
                }

                // Small pause between downloads
                await new Promise(resolve => setTimeout(() => resolve(undefined), 800));
            }
        } finally {
            processingRef.current = false;
            setIsQueueRunning(false);
        }
    }, [updateItem]);

    // Watch queue for new waiting items and start processing
    useEffect(() => {
        const hasWaiting = queue.some(i => i.status === 'waiting');
        if (hasWaiting && !processingRef.current) {
            processQueue();
        }
    }, [queue, processQueue]);

    const addToQueue = useCallback((
        items: Omit<QueueItem, 'id' | 'status' | 'progress' | 'eta'>[],
        formatId: string | null
    ) => {
        const newItems: QueueItem[] = items.map(item => ({
            ...item,
            id: generateId(),
            formatId,
            status: 'waiting',
            progress: 0,
            eta: 0,
        }));
        setQueue(prev => [...prev, ...newItems]);
    }, []);

    const cancelItem = useCallback((id: string) => {
        cancelledIds.current.add(id);
        // If currently downloading this item, kill the process
        if (activeProcessId.current) {
            YtDlpNative.cancelDownload(activeProcessId.current).catch(() => { });
        }
        setQueue(prev => prev.map(item =>
            item.id === id && (item.status === 'waiting' || item.status === 'downloading')
                ? { ...item, status: 'cancelled' }
                : item
        ));
    }, []);

    const cancelAll = useCallback(() => {
        if (activeProcessId.current) {
            YtDlpNative.cancelDownload(activeProcessId.current).catch(() => { });
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
        if (activeProcessId.current) {
            YtDlpNative.cancelDownload(activeProcessId.current).catch(() => { });
        }
        // Mark all current items as cancelled in our ref just in case
        queueRef.current.forEach(item => cancelledIds.current.add(item.id));
        setQueue([]);
    }, []);

    const retryFailed = useCallback(() => {
        setQueue(prev => prev.map(item =>
            item.status === 'failed'
                ? { ...item, status: 'waiting', progress: 0, eta: 0, errorMessage: undefined }
                : item
        ));
    }, []);

    return {
        queue,
        isQueueRunning,
        totalDone,
        totalFailed,
        addToQueue,
        cancelItem,
        cancelAll,
        clearQueue,
        retryFailed,
    };
};
