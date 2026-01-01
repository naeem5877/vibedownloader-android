/**
 * useYtDlp - React hook for yt-dlp operations
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
    YtDlpNative,
    onDownloadProgress,
    generateProcessId,
    VideoInfo,
    DownloadProgress,
    DownloadResult,
    ValidationResult,
    DownloadedFile,
} from '../native/YtDlpModule';

export interface UseYtDlpState {
    // Fetch info state
    isLoading: boolean;
    videoInfo: VideoInfo | null;
    fetchError: string | null;

    // Download state
    isDownloading: boolean;
    downloadProgress: number;
    downloadEta: number;
    downloadError: string | null;
    currentProcessId: string | null;

    // Validation
    validationResult: ValidationResult | null;
}

export interface UseYtDlpActions {
    fetchInfo: (url: string) => Promise<void>;
    download: (url: string, formatId?: string) => Promise<DownloadResult | null>;
    cancelDownload: () => Promise<void>;
    validateUrl: (url: string) => Promise<ValidationResult>;
    clearState: () => void;
    updateYtDlp: () => Promise<void>;
    listDownloadedFiles: () => Promise<DownloadedFile[]>;
    deleteFile: (path: string) => Promise<boolean>;
    getOutputDirectory: () => Promise<string>;
}

export function useYtDlp(): [UseYtDlpState, UseYtDlpActions] {
    const [isLoading, setIsLoading] = useState(false);
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadEta, setDownloadEta] = useState(0);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);

    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

    const processIdRef = useRef<string | null>(null);

    // Subscribe to download progress events
    useEffect(() => {
        const unsubscribe = onDownloadProgress((progress: DownloadProgress) => {
            if (progress.processId === processIdRef.current) {
                setDownloadProgress(progress.progress);
                setDownloadEta(progress.eta);
            }
        });

        return () => unsubscribe();
    }, []);

    const fetchInfo = useCallback(async (url: string) => {
        setIsLoading(true);
        setFetchError(null);
        setVideoInfo(null);

        try {
            const info = await YtDlpNative.fetchInfo(url);
            setVideoInfo(info);
        } catch (error: any) {
            setFetchError(error.message || 'Failed to fetch video info');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const download = useCallback(async (url: string, formatId?: string): Promise<DownloadResult | null> => {
        const processId = generateProcessId();
        processIdRef.current = processId;

        setIsDownloading(true);
        setDownloadProgress(0);
        setDownloadEta(0);
        setDownloadError(null);
        setCurrentProcessId(processId);

        try {
            const result = await YtDlpNative.download(url, formatId || null, processId);
            return result;
        } catch (error: any) {
            if (error.code !== 'CANCELLED') {
                setDownloadError(error.message || 'Download failed');
            }
            return null;
        } finally {
            setIsDownloading(false);
            setCurrentProcessId(null);
            processIdRef.current = null;
        }
    }, []);

    const cancelDownload = useCallback(async () => {
        if (currentProcessId) {
            try {
                await YtDlpNative.cancelDownload(currentProcessId);
            } catch (error) {
                console.error('Failed to cancel download:', error);
            }
        }
    }, [currentProcessId]);

    const validateUrl = useCallback(async (url: string): Promise<ValidationResult> => {
        try {
            const result = await YtDlpNative.validateUrl(url);
            setValidationResult(result);
            return result;
        } catch (error: any) {
            const result = { valid: false, platform: null };
            setValidationResult(result);
            return result;
        }
    }, []);

    const clearState = useCallback(() => {
        setVideoInfo(null);
        setFetchError(null);
        setDownloadError(null);
        setDownloadProgress(0);
        setDownloadEta(0);
        setValidationResult(null);
    }, []);

    const updateYtDlp = useCallback(async () => {
        try {
            await YtDlpNative.updateYtDlp();
        } catch (error: any) {
            console.error('Failed to update yt-dlp:', error);
        }
    }, []);

    const listDownloadedFiles = useCallback(async (): Promise<DownloadedFile[]> => {
        try {
            return await YtDlpNative.listDownloadedFiles();
        } catch (error) {
            return [];
        }
    }, []);

    const deleteFile = useCallback(async (path: string): Promise<boolean> => {
        try {
            return await YtDlpNative.deleteFile(path);
        } catch (error) {
            return false;
        }
    }, []);

    const getOutputDirectory = useCallback(async (): Promise<string> => {
        try {
            return await YtDlpNative.getOutputDirectory();
        } catch (error) {
            return '';
        }
    }, []);

    const state: UseYtDlpState = {
        isLoading,
        videoInfo,
        fetchError,
        isDownloading,
        downloadProgress,
        downloadEta,
        downloadError,
        currentProcessId,
        validationResult,
    };

    const actions: UseYtDlpActions = {
        fetchInfo,
        download,
        cancelDownload,
        validateUrl,
        clearState,
        updateYtDlp,
        listDownloadedFiles,
        deleteFile,
        getOutputDirectory,
    };

    return [state, actions];
}

export default useYtDlp;
