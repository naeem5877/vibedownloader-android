/**
 * YtDlp Native Module Bridge
 * TypeScript interface for the native Kotlin YtDlpModule
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// Type definitions
export interface VideoFormat {
    formatId: string;
    formatNote: string;
    ext: string;
    filesize: number;
    tbr: number;
    width: number;
    height: number;
    resolution: string;
    fps: number;
    vcodec: string;
    acodec: string;
    hasVideo: boolean;
    hasAudio: boolean;
}

export interface VideoInfo {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    uploader: string;
    uploaderUrl: string;
    duration: number;
    viewCount: number;
    likeCount: number;
    uploadDate: string;
    extractor: string;
    url: string;
    platform: Platform;
    ext: string;
    filesize: number;
    resolution: string;
    width: number;
    height: number;
    fps: number;
    formats: VideoFormat[];
}

export interface DownloadResult {
    processId: string;
    outputDir: string;
    exitCode: number;
    output: string;
}

export interface DownloadProgress {
    processId: string;
    progress: number;
    eta: number;
    line: string;
}

export interface ValidationResult {
    valid: boolean;
    platform: string | null;
}

export interface DownloadedFile {
    name: string;
    path: string;
    size: number;
    modified: number;
}

export type Platform =
    | 'YouTube'
    | 'Instagram'
    | 'Facebook'
    | 'TikTok'
    | 'Spotify'
    | 'X'
    | 'Pinterest'
    | 'SoundCloud'
    | 'Unknown';

export type UpdateStatus = 'DONE' | 'ALREADY_UP_TO_DATE' | 'ERROR';

// Native module interface
interface YtDlpNativeModule {
    fetchInfo(url: string): Promise<VideoInfo>;
    download(url: string, formatId: string | null, processId: string): Promise<DownloadResult>;
    cancelDownload(processId: string): Promise<boolean>;
    updateYtDlp(): Promise<{ status: UpdateStatus }>;
    getSupportedPlatforms(): Promise<string[]>;
    validateUrl(url: string): Promise<ValidationResult>;
    getOutputDirectory(): Promise<string>;
    listDownloadedFiles(): Promise<DownloadedFile[]>;
    deleteFile(filePath: string): Promise<boolean>;
}

const { YtDlpModule } = NativeModules;

if (!YtDlpModule) {
    throw new Error(
        'YtDlpModule native module is not available. Make sure you are running on Android and the native module is properly linked.'
    );
}

// Export the native module with proper typing
export const YtDlpNative: YtDlpNativeModule = YtDlpModule;

// Event emitter for download progress
export const ytDlpEventEmitter = new NativeEventEmitter(YtDlpModule);

/**
 * Subscribe to download progress events
 */
export function onDownloadProgress(
    callback: (progress: DownloadProgress) => void
): () => void {
    const subscription = ytDlpEventEmitter.addListener('onDownloadProgress', callback);
    return () => subscription.remove();
}

/**
 * Generate a unique process ID for downloads
 */
export function generateProcessId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Format duration from seconds to HH:MM:SS
 */
export function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return 'Unknown size';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format view count to human readable string
 */
export function formatViewCount(count: number): string {
    if (count >= 1000000000) {
        return `${(count / 1000000000).toFixed(1)}B`;
    }
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
}

// Default export
export default {
    YtDlpNative,
    ytDlpEventEmitter,
    onDownloadProgress,
    generateProcessId,
    formatDuration,
    formatFileSize,
    formatViewCount,
};
