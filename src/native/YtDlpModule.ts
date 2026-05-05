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
    fetchInfo(url: string, options?: { cookies?: string }): Promise<VideoInfo>;
    download(url: string, formatId: string | null, processId: string, options?: { title?: string; artist?: string; platform?: string; cookies?: string; thumbnailPath?: string }): Promise<DownloadResult>;
    downloadSpotifyTrack(searchQuery: string, title: string, artist: string, thumbnail: string | null, processId: string): Promise<DownloadResult>;
    cancelDownload(processId: string): Promise<boolean>;
    updateYtDlp(): Promise<{ status: string }>;
    getVersions(): Promise<{ appVersion: string; ytdlpVersion: string }>;
    getSupportedPlatforms(): Promise<string[]>;
    validateUrl(url: string): Promise<ValidationResult>;
    getOutputDirectory(): Promise<string>;
    getPlaylistInfo(url: string, options?: { cookies?: string; extractorArgs?: string }): Promise<string>;
    listDownloadedFiles(): Promise<DownloadedFile[]>;
    deleteFile(filePath: string): Promise<boolean>;
    openFile(filePath: string): Promise<boolean>;
    shareFile(filePath: string): Promise<boolean>;
    // Share Intent Methods
    getSharedText(): Promise<string | null>;
    getSharedData(): Promise<SharedData | null>;
    saveThumbnail(url: string, title: string): Promise<string>;
    saveCookiesToFile(cookiesText: string, platform: string): Promise<string>;
    getCookiesFilePath(platform: string): Promise<string | null>;
    fileExists(path: string): Promise<boolean>;
    /**
     * Deletes the cookie .txt file at [path] from the native filesDir.
     * Use this on logout to ensure stale session tokens don't persist across
     * app reinstalls or debug builds.
     */
    deleteCookieFile(path: string): Promise<boolean>;
    /**
     * Reads ALL cookies for [url] directly from Android's WebView CookieManager,
     * including HttpOnly session cookies that JS / @react-native-cookies cannot see.
     * Returns a flat string like "name1=value1; name2=value2" or "" if none found.
     */
    getWebViewCookies(url: string): Promise<string>;
    /**
     * Downloads [url] to the app's thumbnail cache directory and returns
     * the absolute local path. Pass this path to download() as thumbnailPath
     * so yt-dlp embeds the high-res album art instead of the video thumbnail.
     */
    downloadThumbnailToCache(url: string): Promise<string>;
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
