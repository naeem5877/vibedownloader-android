import { useState, useCallback, useEffect } from 'react';
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
    download: (url: string, formatId: string | null) => Promise<DownloadResult | null>;
    cancelDownload: () => Promise<void>;
    validateUrl: (url: string) => Promise<ValidationResult>;
    reset: () => void;
    checkSharedText: () => Promise<string | null>;
    getSharedData: () => Promise<SharedData | null>;
    getClipboardText: () => Promise<string>;
    saveThumbnail: (url: string, title: string) => Promise<string>;
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
    const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);

    // Listen for progress events with error handling
    useEffect(() => {
        let subscription: any;

        try {
            subscription = ytDlpEventEmitter.addListener(
                'onDownloadProgress',
                (event) => {
                    if (event.processId === currentProcessId) {
                        setState((prev) => ({
                            ...prev,
                            downloadProgress: event.progress || 0,
                            downloadEta: event.eta || 0,
                            downloadLine: event.line || '',
                        }));
                    }
                }
            );
        } catch (error) {
            console.warn('Failed to add progress listener:', error);
        }

        return () => {
            try {
                subscription?.remove();
            } catch (error) {
                // Ignore cleanup errors
            }
        };
    }, [currentProcessId]);

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
        async (url: string, formatId: string | null) => {
            const processId = generateProcessId();
            setCurrentProcessId(processId);

            setState((prev) => ({
                ...prev,
                isDownloading: true,
                downloadProgress: 0,
                downloadEta: 0,
                downloadError: null,
            }));

            try {
                if (!YtDlpNative || !YtDlpNative.download) {
                    throw new Error('Native module not available');
                }

                const result = await YtDlpNative.download(url, formatId, processId);
                setState((prev) => ({ ...prev, isDownloading: false, downloadProgress: 100 }));
                return result;
            } catch (error: any) {
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
                setCurrentProcessId(null);
            }
        },
        []
    );

    const cancelDownload = useCallback(async () => {
        try {
            if (currentProcessId && YtDlpNative?.cancelDownload) {
                await YtDlpNative.cancelDownload(currentProcessId);
            }
            setState((prev) => ({ ...prev, isDownloading: false }));
        } catch (error) {
            console.warn('Cancel download error:', error);
            // Still update state even if cancel fails
            setState((prev) => ({ ...prev, isDownloading: false }));
        }
    }, [currentProcessId]);

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

    return [
        state,
        {
            fetchInfo,
            download,
            cancelDownload,
            validateUrl,
            reset,
            checkSharedText,
            getSharedData,
            getClipboardText,
            saveThumbnail
        },
    ];
};
