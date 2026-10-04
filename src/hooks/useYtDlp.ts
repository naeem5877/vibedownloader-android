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
    /**
     * Set when a cut range was requested but could not be applied, so the caller
     * can tell the user the untrimmed file was saved rather than failing.
     */
    cutWarning: string | null;
}

/** Optional per-download tuning passed straight through to the native module. */
export interface YtDlpDownloadOptions {
    title?: string;
    artist?: string;
    platform?: string;
    cookies?: string;
    thumbnailPath?: string;
    audioFormatId?: string;
    /**
     * The YouTube player client that produced the format list. Format ids are
     * client-specific, so the download has to ask for the same one.
     */
    playerClient?: string;
    /** In-point in seconds; requires `cutEnd`. Cut to `[cutStart, cutEnd)`. */
    cutStart?: number;
    /** Out-point in seconds; requires `cutStart > 0` or an explicit in-point. */
    cutEnd?: number;
    /**
     * Stop a live recording after this many seconds. Left unset the recording
     * runs until cancelled, which is what a live stream needs since it has no
     * natural end.
     */
    maxDurationSeconds?: number;
    /**
     * Set for live broadcasts so the normal download timeout is not applied to
     * a stream that is still running on purpose.
     */
    isLive?: boolean;
}

export interface UseYtDlpActions {
    fetchInfo: (url: string, options?: { cookies?: string; args?: string[] }) => Promise<void>;
    download: (url: string, formatId: string | null, options?: YtDlpDownloadOptions) => Promise<DownloadResult | null>;
    downloadSpotifyTrack: (searchQuery: string, title: string, artist: string, album: string, thumbnail: string | null) => Promise<DownloadResult | null>;
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
    cutWarning: null,
};

// A refetch of the same URL (duplicate share intents, going back and forward)
// should not pay for extraction again. Small TTL so changes that yt-dlp can now
// handle still get picked up. Module scope so it survives re-renders.
const infoCache = new Map<string, { at: number; info: VideoInfo }>();
const INFO_CACHE_TTL_MS = 5 * 60 * 1000;
const INFO_CACHE_MAX = 20;

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

    const fetchInfo = useCallback(async (url: string, options?: { cookies?: string; args?: string[] }) => {
        // Cookies and extractor args change what yt-dlp returns (age gates, private
        // videos, geo blocks), so they have to be part of the key - otherwise a
        // refetch after signing in would serve the signed-out result from cache.
        const cacheKey = options?.cookies || options?.args?.length
            ? `${url}\u0000${options.cookies ?? ''}\u0000${options.args?.join('') ?? ''}`
            : url;
        const cached = infoCache.get(cacheKey);
        if (cached && Date.now() - cached.at < INFO_CACHE_TTL_MS) {
            setState((prev) => ({
                ...prev,
                isLoading: false,
                fetchError: null,
                videoInfo: cached.info,
            }));
            return;
        }

        setState((prev) => ({
            ...prev,
            isLoading: true,
            fetchError: null,
            videoInfo: null,
            downloadError: null,
            cutWarning: null
        }));

        // Paint the card from the cheap oEmbed lookup while the real extraction
        // runs; it can take tens of seconds because YouTube's player handshake is
        // slow, and there is no point showing a blank screen for that long.
        const quickInfo = YtDlpNative?.fetchQuickInfo
            ? await YtDlpNative.fetchQuickInfo(url).catch(() => null)
            : null;

        if (quickInfo?.title) {
            setState((prev) => (prev.isLoading
                ? {
                    ...prev,
                    videoInfo: {
                        id: '',
                        title: quickInfo.title,
                        description: '',
                        thumbnail: quickInfo.thumbnail,
                        uploader: quickInfo.uploader,
                        uploaderUrl: '',
                        duration: 0,
                        viewCount: 0,
                        likeCount: 0,
                        uploadDate: '',
                        extractor: quickInfo.platform,
                        url,
                        platform: quickInfo.platform,
                        formats: [],
                        partial: true,
                    },
                }
                : prev));
        }

        try {
            // Check if native module is available
            if (!YtDlpNative || !YtDlpNative.fetchInfo) {
                throw new Error('Native module not available. Please restart the app.');
            }

            const info = await YtDlpNative.fetchInfo(url, options);

            if (!info) {
                throw new Error('No video information found');
            }

            infoCache.set(cacheKey, { at: Date.now(), info });
            if (infoCache.size > INFO_CACHE_MAX) {
                const oldest = infoCache.keys().next().value;
                if (oldest) infoCache.delete(oldest);
            }

            setState((prev) => ({
                ...prev,
                isLoading: false,
                videoInfo: info
            }));
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to fetch video info. Please check the URL and try again.';
            console.warn('fetchInfo error:', error);

            setState((prev) => ({
                ...prev,
                isLoading: false,
                // Keep the quick card visible; it still tells the user which video
                // failed instead of dropping back to a blank screen.
                videoInfo: prev.videoInfo?.partial ? null : prev.videoInfo,
                fetchError: errorMessage,
            }));
        }
    }, []);

    const download = useCallback(
        async (url: string, formatId: string | null, options?: YtDlpDownloadOptions) => {
            const processId = generateProcessId();
            processIdRef.current = processId;

            const isCut = typeof options?.cutStart === 'number' && typeof options?.cutEnd === 'number';
            const requestedRange =
                isCut ? ` (cut ${(options!.cutStart! as number).toFixed(1)}-${(options!.cutEnd! as number).toFixed(1)}s)` : '';

            setState((prev) => ({
                ...prev,
                isDownloading: true,
                downloadProgress: 0,
                downloadEta: 0,
                downloadLine: 'Preparing download...',
                downloadError: null,
                cutWarning: null,
            }));

// Overall timeout (5 minutes max for any download). A cut gets a much
      // longer budget because it is a post-process that may fall back from a
      // fast stream copy to a full re-encode after the download has finished.
      //
      // A live stream deliberately has no timeout: it is still running, so
      // there is no "slow server" to give up on. It ends when the user cancels,
      // or on its own when a maxDurationSeconds cap was set.
      const timeoutMs = isCut
        ? 45 * 60 * 1000
        : options?.isLive
          ? null
          : 300000;
      const downloadTimeout =
          timeoutMs === null
              ? null
              : setTimeout(() => {
                  console.warn(`Download hard timeout reached${requestedRange}`);
                  if (YtDlpNative?.cancelDownload) {
                      YtDlpNative.cancelDownload(processId).catch(() => { });
                  }
                  setState((prev) => ({
                      ...prev,
                      isDownloading: false,
                      downloadError: isCut
                          ? 'Timed out while preparing your clip. The clip is cut after the full file downloads, so very long videos can take a while.'
                          : 'Download timed out. The server may be slow or the file is too large.',
                  }));
              }, timeoutMs);

            try {
                if (!YtDlpNative || !YtDlpNative.download) {
                    throw new Error('Native module not available');
                }

                const result = await YtDlpNative.download(url, formatId, processId, options);
        if (downloadTimeout !== null) clearTimeout(downloadTimeout);
                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    downloadProgress: 100,
                    // A requested cut that did not apply still leaves a usable
                    // download, so warn instead of reporting a failure.
                    cutWarning:
                        isCut && result?.cutApplied === false
                            ? 'The clip could not be trimmed, so the full video was saved instead.'
                            : null,
                }));
                return result;
            } catch (error: any) {
                if (downloadTimeout !== null) clearTimeout(downloadTimeout);
                if (error.code === 'CANCELLED') {
                    setState((prev) => ({ ...prev, isDownloading: false }));
                    return null;
                }

                const errorMessage = error?.message || 'Download failed. Please try again.';
                console.warn('download error:', error);

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
        async (searchQuery: string, title: string, artist: string, album: string, thumbnail: string | null) => {
            const processId = generateProcessId();
            processIdRef.current = processId;
 
            setState((prev) => ({
                ...prev,
                isDownloading: true,
                downloadProgress: 0,
                downloadEta: 0,
downloadLine: 'Searching for track...',
                  downloadError: null,
                  cutWarning: null,
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
 
                const result = await YtDlpNative.downloadSpotifyTrack(searchQuery, title, artist, album, thumbnail, processId);
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
                console.warn('downloadSpotifyTrack error:', error);
 
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
              cutWarning: null,
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
            downloadError: null,
            cutWarning: null
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
