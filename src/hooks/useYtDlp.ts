import { useState, useCallback, useEffect, useRef } from 'react';
import { NativeEventEmitter } from 'react-native';
import {
    YtDlpNative,
    VideoInfo,
    DownloadResult,
    ValidationResult,
    SharedData,
    ytDlpEventEmitter,
} from '../native/YtDlpModule';

interface UseYtDlpState {
    isLoading: boolean;
    isDownloading: boolean;
    videoInfo: VideoInfo | null;
    downloadProgress: number;
    downloadEta: number;
    downloadLine: string;
    fetchError: string | null;
    downloadError: string | null;
}

interface UseYtDlpActions {
    fetchInfo: (url: string) => Promise<void>;
    download: (url: string, formatId: string | null, options?: { title?: string; artist?: string; platform?: string }) => Promise<DownloadResult | null>;
    downloadSpotifyTrack: (searchQuery: string, title: string, artist: string, thumbnail: string | null) => Promise<DownloadResult | null>;
    cancelDownload: () => Promise<void>;
    validateUrl: (url: string) => Promise<ValidationResult>;
    reset: () => void;
    checkSharedText: () => Promise<string | null>;
    getSharedData: () => Promise<SharedData | null>;
    getClipboardText: () => Promise<string>;
    saveThumbnail: (url: string, title: string) => Promise<string>;
    setVideoInfo: (info: VideoInfo) => void;
    setDownloadProgress: (progress: number, eta: number, line: string) => void;
}

const initialState: UseYtDlpState = {
    isLoading: false,
    isDownloading: false,
    videoInfo: null,
    downloadProgress: 0,
    downloadEta: 0,
    downloadLine: '',
    fetchError: null,
    downloadError: null,
};

export const useYtDlp = (): [UseYtDlpState, UseYtDlpActions] => {
    const [state, setState] = useState<UseYtDlpState>(initialState);
    const processIdRef = useRef<string | null>(null);

    // Listen for progress events with error handling
    useEffect(() => {
        let subscription: any;
        let lastProgressTime = Date.now();
        let lastProgress = -1;
        let staleTimeout: ReturnType<typeof setTimeout> | null = null;

        try {
            subscription = ytDlpEventEmitter.addListener(
                'onDownloadProgress',
                (event) => {
                    if (event.processId === processIdRef.current) {
                        // Clamp progress between 0 and 100 to prevent -1% display
                        const clampedProgress = Math.max(0, Math.min(event.progress || 0, 100));

                        // Track progress changes for stale detection
                        if (clampedProgress !== lastProgress) {
                            lastProgress = clampedProgress;
                            lastProgressTime = Date.now();
                        }

                        // Determine status message based on line content
                        let statusLine = event.line || '';
                        if (statusLine.toLowerCase().includes('processing') ||
                            statusLine.toLowerCase().includes('ffmpeg') ||
                            statusLine.toLowerCase().includes('converting')) {
                            // During post-processing, show a friendly message
                            statusLine = clampedProgress >= 99 ? 'Almost done... Converting...' : statusLine;
                        }

                        setState((prev) => ({
                            ...prev,
                            downloadProgress: clampedProgress,
                            downloadEta: event.eta || 0,
                            downloadLine: statusLine,
                        }));

                        // Clear existing stale timeout
                        if (staleTimeout) clearTimeout(staleTimeout);

                        // Set stale detection: if no progress change for 120 seconds, flag as stuck
                        staleTimeout = setTimeout(() => {
                            const timeSinceLastChange = Date.now() - lastProgressTime;
                            if (timeSinceLastChange > 120000) {
                                console.warn('Download appears stale - no progress for 2 minutes');
                                // Auto-cancel stale download
                                if (processIdRef.current && YtDlpNative?.cancelDownload) {
                                    YtDlpNative.cancelDownload(processIdRef.current).catch(() => { });
                                }
                                setState((prev) => ({
                                    ...prev,
                                    isDownloading: false,
                                    downloadError: 'Download timed out during processing. Please try again.',
                                }));
                            }
                        }, 120000);
                    }
                }
            );
        } catch (error) {
            console.warn('Failed to add progress listener:', error);
        }

        return () => {
            try {
                subscription?.remove();
                if (staleTimeout) clearTimeout(staleTimeout);
            } catch (error) {
                // Ignore cleanup errors
            }
        };
    }, []);

    const generateProcessId = () => Math.random().toString(36).substring(7);

    const fetchInfo = useCallback(async (url: string) => {
        setState((prev) => ({
            ...prev,
            isLoading: true,
            fetchError: null,
            videoInfo: null,
            downloadError: null
        }));

        try {
            // Check if native module is available
            if (!YtDlpNative || !YtDlpNative.fetchInfo) {
                throw new Error('Native module not available. Please restart the app.');
            }

            const info = await YtDlpNative.fetchInfo(url);

            if (!info) {
                throw new Error('No video information found');
            }

            setState((prev) => ({
                ...prev,
                isLoading: false,
                videoInfo: info
            }));
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to fetch video info. Please check the URL and try again.';
            console.error('fetchInfo error:', error);

            setState((prev) => ({
                ...prev,
                isLoading: false,
                fetchError: errorMessage,
            }));
        }
    }, []);

    const download = useCallback(
        async (url: string, formatId: string | null, options?: { title?: string; artist?: string; platform?: string }) => {
            const processId = generateProcessId();
            processIdRef.current = processId;

            setState((prev) => ({
                ...prev,
                isDownloading: true,
                downloadProgress: 0,
                downloadEta: 0,
                downloadLine: 'Preparing download...',
                downloadError: null,
            }));

            // Overall timeout (5 minutes max for any download)
            const downloadTimeout = setTimeout(() => {
                console.warn('Download hard timeout reached (5 min)');
                if (YtDlpNative?.cancelDownload) {
                    YtDlpNative.cancelDownload(processId).catch(() => { });
                }
                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    downloadError: 'Download timed out. The server may be slow or the file is too large.',
                }));
            }, 300000); // 5 minutes

            try {
                if (!YtDlpNative || !YtDlpNative.download) {
                    throw new Error('Native module not available');
                }

                const result = await YtDlpNative.download(url, formatId, processId, options);
                clearTimeout(downloadTimeout);
                setState((prev) => ({ ...prev, isDownloading: false, downloadProgress: 100 }));
                return result;
            } catch (error: any) {
                clearTimeout(downloadTimeout);
                if (error.code === 'CANCELLED') {
                    setState((prev) => ({ ...prev, isDownloading: false }));
                    return null;
                }

                const errorMessage = error?.message || 'Download failed. Please try again.';
                console.error('download error:', error);

                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    downloadError: errorMessage,
                }));
                return null;
            } finally {
                processIdRef.current = null;
            }
        },
        []
    );

    const downloadSpotifyTrack = useCallback(
        async (searchQuery: string, title: string, artist: string, thumbnail: string | null) => {
            const processId = generateProcessId();
            processIdRef.current = processId;

            setState((prev) => ({
                ...prev,
                isDownloading: true,
                downloadProgress: 0,
                downloadEta: 0,
                downloadLine: 'Searching for track...',
                downloadError: null,
            }));

            // Overall timeout (5 minutes)
            const downloadTimeout = setTimeout(() => {
                console.warn('Spotify download hard timeout reached (5 min)');
                if (YtDlpNative?.cancelDownload) {
                    YtDlpNative.cancelDownload(processId).catch(() => { });
                }
                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    downloadError: 'Download timed out. Please try again.',
                }));
            }, 300000);

            try {
                if (!YtDlpNative || !YtDlpNative.downloadSpotifyTrack) {
                    throw new Error('Native module not available');
                }

                const result = await YtDlpNative.downloadSpotifyTrack(searchQuery, title, artist, thumbnail, processId);
                clearTimeout(downloadTimeout);
                setState((prev) => ({ ...prev, isDownloading: false, downloadProgress: 100 }));
                return result;
            } catch (error: any) {
                clearTimeout(downloadTimeout);
                if (error.code === 'CANCELLED') {
                    setState((prev) => ({ ...prev, isDownloading: false }));
                    return null;
                }

                const errorMessage = error?.message || 'Download failed. Please try again.';
                console.error('downloadSpotifyTrack error:', error);

                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    downloadError: errorMessage,
                }));
                return null;
            } finally {
                processIdRef.current = null;
            }
        },
        []
    );

    const cancelDownload = useCallback(async () => {
        try {
            if (processIdRef.current && YtDlpNative?.cancelDownload) {
                await YtDlpNative.cancelDownload(processIdRef.current);
            }
            setState((prev) => ({ ...prev, isDownloading: false }));
        } catch (error) {
            console.warn('Cancel download error:', error);
            // Still update state even if cancel fails
            setState((prev) => ({ ...prev, isDownloading: false }));
        }
    }, []);

    const validateUrl = useCallback(async (url: string): Promise<ValidationResult> => {
        try {
            if (!YtDlpNative?.validateUrl) {
                return { valid: false, platform: null };
            }
            return await YtDlpNative.validateUrl(url);
        } catch (error) {
            console.warn('Validate URL error:', error);
            return { valid: false, platform: null };
        }
    }, []);

    const reset = useCallback(() => {
        setState(prev => ({
            ...prev,
            videoInfo: null,
            fetchError: null,
            downloadError: null,
            isDownloading: false
        }));
    }, []);

    const checkSharedText = useCallback(async (): Promise<string | null> => {
        try {
            if (!YtDlpNative?.getSharedText) {
                return null;
            }
            return await YtDlpNative.getSharedText();
        } catch (error) {
            console.warn('Check shared text error:', error);
            return null;
        }
    }, []);

    const getSharedData = useCallback(async (): Promise<SharedData | null> => {
        try {
            if (!YtDlpNative?.getSharedData) {
                return null;
            }
            return await YtDlpNative.getSharedData();
        } catch (error) {
            console.warn('Get shared data error:', error);
            return null;
        }
    }, []);

    const getClipboardText = useCallback(async (): Promise<string> => {
        try {
            if (!YtDlpNative?.getClipboardText) {
                return '';
            }
            return await YtDlpNative.getClipboardText();
        } catch (error) {
            console.warn('Get clipboard error:', error);
            return '';
        }
    }, []);

    const saveThumbnail = useCallback(async (url: string, title: string): Promise<string> => {
        try {
            if (!YtDlpNative?.saveThumbnail) {
                throw new Error('Save thumbnail not available');
            }
            return await YtDlpNative.saveThumbnail(url, title);
        } catch (error: any) {
            console.error('Save thumbnail error:', error);
            throw error;
        }
    }, []);

    const setVideoInfo = useCallback((info: VideoInfo) => {
        setState((prev) => ({
            ...prev,
            videoInfo: info,
            isLoading: false,
            fetchError: null,
            downloadError: null
        }));
    }, []);

    const setDownloadProgress = useCallback((progress: number, eta: number, line: string) => {
        setState((prev) => ({
            ...prev,
            isDownloading: true,
            downloadProgress: Math.max(0, Math.min(100, progress)),
            downloadEta: eta,
            downloadLine: line,
        }));
    }, []);

    return [
        state,
        {
            fetchInfo,
            download,
            downloadSpotifyTrack,
            cancelDownload,
            validateUrl,
            reset,
            checkSharedText,
            getSharedData,
            getClipboardText,
            saveThumbnail,
            setVideoInfo,
            setDownloadProgress,
        },
    ];
};
