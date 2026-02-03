import { NativeModules, NativeEventEmitter } from 'react-native';

// Type definitions for VideoInfo
export interface Format {
    formatId: string;
    formatNote?: string;
    ext?: string;
    filesize?: number;
    tbr?: number;
    width?: number;
    height?: number;
    resolution?: string;
    fps?: number;
    vcodec?: string;
    acodec?: string;
    hasVideo?: boolean;
    hasAudio?: boolean;
}

export interface VideoInfo {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    uploader: string;
    uploaderUrl: string;
    duration: number; // seconds
    viewCount: number;
    likeCount: number;
    uploadDate: string;
    extractor: string; // youtube, instagram, etc
    url: string;
    platform: string;
    formats: Format[];
    ext?: string;
    filesize?: number;
    width?: number;
    height?: number;
    fps?: number;
}

export interface ValidationResult {
    valid: boolean;
    platform: string | null;
}

export interface DownloadProgress {
    processId: string;
    progress: number;
    eta: number;
    line: string;
}

export interface DownloadResult {
    processId: string;
    outputDir: string;
    exitCode: number;
    output: string;
}

export interface DownloadedFile {
    name: string;
    path: string;
    size: number;
    modified: number;
    platform: string;
    contentType: string;
    extension: string;
    thumbnail?: string | null;
}

// Shared Data from Intent
export interface SharedData {
    url: string;
    platform: string | null;
    autoFetch: boolean;
}

// Native Module Interface
export interface YtDlpNativeModule {
    fetchInfo(url: string): Promise<VideoInfo>;
    download(url: string, formatId: string | null, processId: string): Promise<DownloadResult>;
    downloadSpotifyTrack(searchQuery: string, title: string, artist: string, thumbnail: string | null, processId: string): Promise<DownloadResult>;
    cancelDownload(processId: string): Promise<boolean>;
    updateYtDlp(): Promise<{ status: string }>;
    getSupportedPlatforms(): Promise<string[]>;
    validateUrl(url: string): Promise<ValidationResult>;
    getOutputDirectory(): Promise<string>;
    getPlaylistInfo(url: string): Promise<string>;
    listDownloadedFiles(): Promise<DownloadedFile[]>;
    deleteFile(filePath: string): Promise<boolean>;
    openFile(filePath: string): Promise<boolean>;
    shareFile(filePath: string): Promise<boolean>;
    // Share Intent Methods
    getSharedText(): Promise<string | null>;
    getSharedData(): Promise<SharedData | null>;
    saveThumbnail(url: string, title: string): Promise<string>;
    getClipboardText(): Promise<string>;
}

const { YtDlpModule } = NativeModules;

export const YtDlpNative: YtDlpNativeModule = YtDlpModule;

export const ytDlpEventEmitter = new NativeEventEmitter(YtDlpModule);

export function onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
    const subscription = ytDlpEventEmitter.addListener('onDownloadProgress', callback);
    return () => subscription.remove();
}

export declare type VideoFormat = Format;

// Helpers
export const formatDuration = (seconds: number): string => {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatFileSize = (bytes: number): string => {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const formatViewCount = (count: number): string => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
};
