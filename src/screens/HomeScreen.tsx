/**
 * HomeScreen - Premium UI for VibeDownloader Mobile
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    StatusBar,
    Alert,
    ToastAndroid,
    PermissionsAndroid,
    Platform,
    Linking,
    AppState,
    Animated,
    Easing,
    TouchableOpacity,
    AppStateStatus,
    Share,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, Typography, PlatformThemes, getPlatformColor, Shadows } from '../theme';
import {
    PlatformSelector,
    URLInput,
    VideoInfoCard,
    FormatList,
    DownloadProgress,
    OfflineBanner,
    UpdateModal,
    EmptyState,
} from '../components';
// FormatToggle removed - automatic mode detection
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { DiscordButton } from '../components/DiscordButton';
import { LosslessCard } from '../components/LosslessCard';
import { BatchDownloadProgress, BatchDownloadItem } from '../components/BatchDownloadProgress';
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat, ytDlpEventEmitter, YtDlpNative } from '../native/YtDlpModule';
import { DownloadIcon, SparkleIcon, ShareIcon, GitHubIcon, DesktopIcon, StarIcon, WaveformIcon, LibraryIcon } from '../components/Icons';
import { checkForUpdates, UpdateInfo } from '../services/GitHubUpdateService';
import { getSpotifyPlaylist, extractSpotifyId, getTrackInfo, buildYouTubeSearchQuery, formatTrackMetadata } from '../services/SpotifyService';
import { checkLosslessAvailability, getLosslessDownloadUrl, LosslessAvailability } from '../services/LosslessService';
import { detectPlatform } from '../utils/platform';
import { Haptics } from '../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HomeScreenProps {
    onNavigateToLibrary?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateToLibrary }) => {
    const [url, setUrl] = useState('');
    const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
    const [userSelectedPlatform, setUserSelectedPlatform] = useState(false);
    // Removed downloadMode toggle - auto-detect based on platform (Spotify/SoundCloud = audio)

    // Playlist State
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [playlistItems, setPlaylistItems] = useState<any[]>([]);
    const [playlistTitle, setPlaylistTitle] = useState('');
    const [playlistImage, setPlaylistImage] = useState<string | undefined>(undefined);
    const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);

    // Network State
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        let NetInfo: any;
        try {
            NetInfo = require('@react-native-community/netinfo').default;
        } catch (e) {
            NetInfo = null;
        }

        if (NetInfo) {
            const unsubscribe = NetInfo.addEventListener((state: any) => {
                setIsOffline(state.isConnected === false);
            });
            return () => unsubscribe();
        }
    }, []);

    // Update Modal State
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    // Lossless State
    const [losslessAvailability, setLosslessAvailability] = useState<LosslessAvailability | null>(null);
    const [isCheckingLossless, setIsCheckingLossless] = useState(false);
    const [isLosslessDownloading, setIsLosslessDownloading] = useState(false);

    // Batch Download Progress State
    const [batchItems, setBatchItems] = useState<BatchDownloadItem[]>([]);
    const [isBatchDownloading, setIsBatchDownloading] = useState(false);
    const [batchCurrentTitle, setBatchCurrentTitle] = useState<string>('');

    const [state, actions] = useYtDlp();

    // Animation refs
    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;
    const batchActiveRef = useRef(false);

    const handleFetch = useCallback(async (text: string = url) => {
        if (!text.trim()) {
            ToastAndroid.show('Please enter a URL', ToastAndroid.SHORT);
            return;
        }

        // 1. Check Spotify
        const spotifyData = extractSpotifyId(text);

        // Spotify Playlist / Album
        if (spotifyData && (spotifyData.type === 'playlist' || spotifyData.type === 'album')) {
            setIsPlaylistLoading(true);
            setPlaylistModalVisible(true);
            try {
                const data = await getSpotifyPlaylist(spotifyData.id);
                setPlaylistTitle(data.name);
                setPlaylistImage(data.images?.[0]?.url);

                const items = data.tracks.items.map((item: any) => ({
                    id: item.track.id,
                    title: item.track.name,
                    author: item.track.artists.map((a: any) => a.name).join(', '),
                    duration: item.track.duration_ms ? `${Math.floor(item.track.duration_ms / 60000)}:${((item.track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}` : undefined,
                    thumbnail: item.track.album.images?.[0]?.url,
                    url: item.track.external_urls.spotify,
                    type: 'spotify',
                    searchQuery: buildYouTubeSearchQuery(item.track),
                    rawTrack: item.track
                }));

                setPlaylistItems(items);
            } catch (error: any) {
                console.error('Spotify error:', error);
                ToastAndroid.show('Failed to fetch Spotify playlist: ' + error.message, ToastAndroid.SHORT);
                setPlaylistModalVisible(false);
            } finally {
                setIsPlaylistLoading(false);
            }
            return;
        }

        // Spotify Single Track
        if (spotifyData && spotifyData.type === 'track') {
            try {
                // Manually trigger loading state if we could, but for now we'll just wait
                ToastAndroid.show('Fetching Spotify track...', ToastAndroid.SHORT);

                const track = await getTrackInfo(spotifyData.id);
                const metadata = formatTrackMetadata(track);

                // Create synthetic VideoInfo for UI to display
                const syntheticInfo: any = {
                    id: track.id,
                    title: track.name,
                    description: `Artist: ${metadata.artist}\nAlbum: ${metadata.album}`,
                    thumbnail: metadata.thumbnail,
                    uploader: metadata.artist,
                    uploaderUrl: '',
                    duration: metadata.duration,
                    viewCount: 0,
                    likeCount: 0,
                    uploadDate: metadata.releaseDate,
                    extractor: 'spotify',
                    url: text,
                    platform: 'Spotify',
                    formats: [
                        { formatId: 'audio_mp3', ext: 'mp3', formatNote: 'High Quality', filesize: 0 }
                    ],
                    // Extra data for downloader
                    searchQuery: buildYouTubeSearchQuery(track),
                    rawMetadata: metadata,
                    spotifyId: spotifyData.id,
                };

                actions.setVideoInfo(syntheticInfo);

                // Check lossless availability in background
                setIsCheckingLossless(true);
                setLosslessAvailability(null);
                checkLosslessAvailability(spotifyData.id)
                    .then((result) => {
                        setLosslessAvailability(result);
                        if (result.available) {
                            ToastAndroid.show('🎵 Lossless FLAC available!', ToastAndroid.SHORT);
                        }
                    })
                    .catch((err) => {
                        console.warn('Lossless check failed:', err);
                        setLosslessAvailability({ available: false, source: 'none' });
                    })
                    .finally(() => setIsCheckingLossless(false));

            } catch (error: any) {
                console.error('Spotify Track Error', error);
                ToastAndroid.show('Failed to fetch Spotify track', ToastAndroid.SHORT);
            }
            return;
        }

        // 2. Check YouTube Playlist
        if (text.includes('list=') || text.includes('playlist')) {
            setIsPlaylistLoading(true);
            setPlaylistModalVisible(true);
            try {
                const json = await YtDlpNative.getPlaylistInfo(text);
                const data = JSON.parse(json);
                setPlaylistTitle(data.title || 'Playlist');
                // setPlaylistImage... yt-dlp dump-single-json flat-playlist excludes thumbnails usually to be fast

                const items = (data.entries || []).map((entry: any) => ({
                    id: entry.id,
                    title: entry.title,
                    author: entry.uploader,
                    duration: entry.duration ? `${Math.floor(entry.duration / 60)}:${(entry.duration % 60).toString().padStart(2, '0')}` : undefined,
                    url: entry.url || `https://youtu.be/${entry.id}`,
                    type: 'youtube'
                }));

                setPlaylistItems(items);
            } catch (error: any) {
                console.error('Playlist fetch error:', error);
                ToastAndroid.show('Failed to fetch playlist info', ToastAndroid.SHORT);
                setPlaylistModalVisible(false); // Fallback to single?
                // If playlist fetch fails, maybe try single fetch?
                actions.fetchInfo(text);
            } finally {
                setIsPlaylistLoading(false);
            }
            return;
        }

        // 3. Normal Single Fetch
        try {
            await actions.fetchInfo(text);
            Haptics.success();
        } catch (error: any) {
            console.error('Fetch error:', error);
            ToastAndroid.show(
                error?.message || 'Failed to fetch video info',
                ToastAndroid.LONG
            );
        }
    }, [url, actions]);

    const checkShareIntent = useCallback(async () => {
        try {
            // Try getSharedData first for structured data with platform
            const sharedData = await actions.getSharedData();

            if (sharedData && sharedData.url) {
                const { url: sharedUrl, platform, autoFetch } = sharedData;

                // Set URL and platform
                setUrl(sharedUrl);
                if (platform) {
                    setDetectedPlatform(platform);
                }

                // Show toast about detected platform
                if (platform && platform !== 'Unknown') {
                    ToastAndroid.show(`📥 ${platform} link detected`, ToastAndroid.SHORT);
                }

                // Auto-fetch if specified
                if (autoFetch) {
                    // Delay fetch slightly to ensure UI is updated
                    setTimeout(() => handleFetch(sharedUrl), 400);
                }
                return;
            }

            // Fallback to legacy method
            const sharedText = await actions.checkSharedText();
            if (sharedText) {
                const urlMatch = sharedText.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch && urlMatch[0]) {
                    const sharedUrl = urlMatch[0];
                    setUrl(sharedUrl);
                    // Auto-detect platform and fetch
                    const detected = detectPlatform(sharedUrl);
                    if (detected !== 'YouTube') setDetectedPlatform(detected);
                    setTimeout(() => handleFetch(sharedUrl), 500);
                }
            }
        } catch (error) {
            console.warn('Error checking shared text:', error);
        }
    }, [actions, handleFetch]);

    const requestPermissions = async () => {
        if (Platform.OS !== 'android') return;

        try {
            const sdkInt = Platform.Version;

            if (sdkInt >= 33) {
                await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                ]);
            } else {
                await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
                );
            }
        } catch (err) {
            console.warn('Permission request error:', err);
        }
    };

    const handleSaveThumbnail = useCallback(async () => {
        if (!state.videoInfo) return;

        ToastAndroid.show('Saving thumbnail...', ToastAndroid.SHORT);
        try {
            await actions.saveThumbnail(state.videoInfo.thumbnail, state.videoInfo.title);
            ToastAndroid.show('Thumbnail saved to Gallery', ToastAndroid.SHORT);
        } catch (e: any) {
            console.error('Thumbnail save error:', e);
            ToastAndroid.show('Failed to save thumbnail', ToastAndroid.SHORT);
        }
    }, [state.videoInfo, actions]);

    const handleCancelDownload = useCallback(async () => {
        Alert.alert(
            'Cancel Download',
            'Are you sure you want to cancel?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await actions.cancelDownload();
                            ToastAndroid.show('Cancelled', ToastAndroid.SHORT);
                        } catch (error) {
                            console.warn('Cancel error:', error);
                        }
                    },
                },
            ],
        );
    }, [actions]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await actions.getClipboardText();
            if (text) {
                Haptics.selection();
                setUrl(text);
                // Optional: Auto-fetch on paste if it looks like a URL
                if (text.startsWith('http')) {
                    const detected = detectPlatform(text);
                    if (detected !== 'YouTube') {
                        setDetectedPlatform(detected);
                    }
                    handleFetch(text);
                }
            }
        } catch (error) {
            console.warn('Clipboard error:', error);
            ToastAndroid.show('Failed to paste from clipboard', ToastAndroid.SHORT);
        }
    }, [actions, handleFetch]);

    // --- Effects ---

    useEffect(() => {
        // Header entrance
        Animated.parallel([
            Animated.timing(headerFadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(headerSlideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();


        // Check for updates on mount
        setTimeout(async () => {
            const info = await checkForUpdates();
            if (info.available) {
                setUpdateInfo(info);
                setUpdateModalVisible(true);
            }
        }, 1500);
    }, []);

    // Dynamic Theme State
    const currentTheme = useMemo(() => {
        if (detectedPlatform) {
            // Find matching theme case-insensitively
            const themeKey = Object.keys(PlatformThemes).find(
                key => key.toLowerCase() === detectedPlatform.toLowerCase()
            );

            if (themeKey && PlatformThemes[themeKey]) {
                return PlatformThemes[themeKey];
            }
        }
        return PlatformThemes.default;
    }, [detectedPlatform]);

    const platformColor = useMemo(() => {
        return getPlatformColor(detectedPlatform);
    }, [detectedPlatform]);

    // Validate URL and detect platform with error handling
    useEffect(() => {
        const validateAndDetect = async () => {
            if (url.trim().length > 5) {
                // Use JS-based detection first as it's faster and handles common cases
                const detected = detectPlatform(url);
                if (detected !== 'YouTube' && !userSelectedPlatform) {
                    setDetectedPlatform(detected);
                } else {
                    // Fallback to native validation if needed or just trust JS
                    try {
                        const result = await actions.validateUrl(url);
                        // Only auto-update platform if user didn't manually select
                        if (!userSelectedPlatform && result.platform && result.platform !== 'Unknown') {
                            setDetectedPlatform(result.platform);
                        }
                    } catch (error) {
                        console.warn('URL validation error:', error);
                    }
                }
            }
        };

        const timer = setTimeout(validateAndDetect, 500);
        return () => clearTimeout(timer);
    }, [url, actions, userSelectedPlatform]);

    // Permissions and intent handling
    useEffect(() => {
        requestPermissions();
        // Delay initial check to ensure bridge is ready
        const timer = setTimeout(() => checkShareIntent(), 300);

        // Listen for real-time share events (emitted from MainActivity)
        const shareSubscription = ytDlpEventEmitter.addListener('onShareReceived', (data: any) => {
            if (data && data.url) {
                const { url: sharedUrl, platform, autoFetch } = data;
                setUrl(sharedUrl);
                if (platform) {
                    setDetectedPlatform(platform);
                }
                if (platform && platform !== 'Unknown') {
                    ToastAndroid.show(`📥 ${platform} shared`, ToastAndroid.SHORT);
                }
                if (autoFetch) {
                    handleFetch(sharedUrl);
                }
            }
        });

        const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                checkShareIntent();
            }
        });

        return () => {
            clearTimeout(timer);
            shareSubscription.remove();
            appStateSubscription.remove();
        };
    }, [handleFetch, checkShareIntent]);

    // ── Lossless Download Handler ──
    const handleLosslessDownload = useCallback(async () => {
        if (!state.videoInfo || !losslessAvailability?.downloadUrl) return;

        const info = state.videoInfo as any;
        const spotifyId = info.spotifyId;
        if (!spotifyId) {
            ToastAndroid.show('No Spotify ID found', ToastAndroid.SHORT);
            return;
        }

        setIsLosslessDownloading(true);
        ToastAndroid.show('Downloading lossless FLAC...', ToastAndroid.SHORT);

        try {
            const downloadUrl = losslessAvailability.downloadUrl;

            // Use standard download action with specific format ID for lossless
            // This triggers the native module to use the correct User-Agent and skip conversion
            const result = await actions.download(downloadUrl, 'lossless_flac', {
                title: info.title,
                artist: info.uploader,
                platform: 'Spotify' // Force Spotify for better categorization
            });

            if (result && (result.exitCode === 0 || !result.hasOwnProperty('exitCode'))) {
                ToastAndroid.show(`✓ Lossless FLAC saved!`, ToastAndroid.SHORT);
            } else if (result !== null) {
                throw new Error(`Download failed (exit code: ${result?.exitCode})`);
            }
        } catch (error: any) {
            console.error('Lossless download error:', error);
            ToastAndroid.show(`Lossless download failed: ${error.message}`, ToastAndroid.LONG);
        } finally {
            setIsLosslessDownloading(false);
        }
    }, [state.videoInfo, losslessAvailability, actions]);

    const handleBatchDownload = useCallback(async (selectedItems: any[], mode: 'video' | 'audio') => {
        setPlaylistModalVisible(false);
        ToastAndroid.show(`Starting ${selectedItems.length} downloads...`, ToastAndroid.SHORT);

        const formatId = mode === 'audio' ? 'audio_mp3' : null;

        const initialBatchItems = selectedItems.map((item) => ({
            id: item.id,
            title: item.title,
            artist: item.author,
            status: 'queued' as const,
        }));
        setBatchItems(initialBatchItems);
        setIsBatchDownloading(true);
        batchActiveRef.current = true;

        for (let index = 0; index < selectedItems.length; index++) {
            if (!batchActiveRef.current) break;

            const item = selectedItems[index];
            setBatchItems((prev) =>
                prev.map((bi) =>
                    bi.id === item.id ? { ...bi, status: 'downloading' } : bi
                )
            );
            setBatchCurrentTitle(item.title);

            try {
                let result;
                if (item.type === 'spotify' && item.searchQuery) {
                    result = await actions.downloadSpotifyTrack(
                        item.searchQuery,
                        item.title,
                        item.author,
                        item.thumbnail
                    );
                } else {
                    result = await actions.download(item.url, formatId);
                }

                if (result === null) {
                    // Cancelled by user
                    setBatchItems((prev) =>
                        prev.map((bi) =>
                            bi.id === item.id ? { ...bi, status: 'failed', error: 'Cancelled' } : bi
                        )
                    );
                    batchActiveRef.current = false;
                    setIsBatchDownloading(false);
                    break;
                }

                // Mark completed
                setBatchItems((prev) =>
                    prev.map((bi) =>
                        bi.id === item.id ? { ...bi, status: 'completed' } : bi
                    )
                );
            } catch (e: any) {
                console.error(`Failed to download ${item.title}`, e);
                setBatchItems((prev) =>
                    prev.map((bi) =>
                        bi.id === item.id
                            ? { ...bi, status: 'failed', error: e?.message || 'Download failed' }
                            : bi
                    )
                );
            }

            // Small delay between downloads
            if (index < selectedItems.length - 1 && batchActiveRef.current) {
                await new Promise<void>((resolve) => setTimeout(resolve, 500));
            }
        }

        setBatchCurrentTitle('');
        batchActiveRef.current = false;
    }, [actions]);

    const handleDownload = useCallback(async (format: VideoFormat | string) => {
        if (!state.videoInfo) return;

        ToastAndroid.show('Starting download...', ToastAndroid.SHORT);

        try {
            // Check if it's a Spotify track (we'll check platform field or custom field)
            if (state.videoInfo.platform === 'Spotify' && (state.videoInfo as any).searchQuery) {
                const info = state.videoInfo as any;
                await actions.downloadSpotifyTrack(
                    info.searchQuery,
                    info.title,
                    info.uploader, // stored artist here
                    info.thumbnail
                );
            } else {
                let formatId = typeof format === 'string' ? format : format.formatId;
                await actions.download(state.videoInfo.url, formatId);
            }
        } catch (error: any) {
            console.error('Download error:', error);
            ToastAndroid.show(error?.message || 'Download failed', ToastAndroid.LONG);
        }
    }, [state.videoInfo, actions]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top']}>
            <OfflineBanner onActionPress={onNavigateToLibrary} />
            <StatusBar barStyle="light-content" backgroundColor={currentTheme.background} animated />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Modern Header */}
                <Animated.View
                    style={[
                        styles.header,
                        { opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }
                    ]}
                >
                    <View style={styles.headerTop}>
                        <View style={styles.headerBrand}>
                            <Text style={styles.logo}>Vibe</Text>
                            <Text style={[styles.logo, { color: Colors.primary }]}>Downloader</Text>
                        </View>

                        {/* Header Actions */}
                        <View style={styles.headerActions}>
                            <DiscordButton compact />
                            <TouchableOpacity
                                onPress={() => Share.share({ message: 'Check out VibeDownloader - The ultimate media downloader for Android! https://github.com/naeem5877/vibedownloader-android' })}
                                style={styles.headerBtn}
                            >
                                <ShareIcon size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => Linking.openURL('https://github.com/naeem5877/vibedownloader-android')}
                                style={styles.headerBtn}
                            >
                                <StarIcon size={18} color="#FFD700" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => Linking.openURL('https://github.com/naeem5877/VibeDownloader')}
                                style={styles.headerBtn}
                            >
                                <DesktopIcon size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.tagline}>
                        Download from any platform, instantly ⚡
                    </Text>
                </Animated.View>

                {/* Platform Selector */}
                <PlatformSelector
                    selectedPlatform={detectedPlatform}
                    onSelectPlatform={(id) => {
                        setDetectedPlatform(id);
                        setUserSelectedPlatform(true); // Mark as manual selection
                        actions.reset();
                    }}
                    disabled={state.isLoading || state.isDownloading}
                />

                {/* Offline Mode Indicator */}
                {isOffline && (
                    <View style={styles.offlineContainer}>
                        <View style={styles.offlineHero}>
                            <View style={styles.offlineGlow} />
                            <Text style={styles.offlineIcon}>🌩️</Text>
                            <Text style={styles.offlineTitle}>Network Interrupted</Text>
                            <Text style={styles.offlineSubtitle}>
                                You are currently offline. Premium downloads are paused, but your Library remains fully accessible.
                            </Text>
                            {onNavigateToLibrary && (
                                <TouchableOpacity
                                    style={[styles.offlineBtn, { backgroundColor: Colors.primary }]}
                                    onPress={onNavigateToLibrary}
                                >
                                    <LibraryIcon size={18} color="#FFF" />
                                    <Text style={styles.offlineBtnText}>OPEN LIBRARY</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* URL Input */}
                {!isOffline && (
                    <View style={styles.inputSection}>
                        <View style={styles.inputRow}>
                            <URLInput
                                value={url}
                                onChangeText={(text) => {
                                    setUrl(text);
                                    if (text.trim().length === 0) {
                                        setUserSelectedPlatform(false);
                                        setDetectedPlatform(null);
                                        actions.reset();
                                    }
                                }}
                                onSubmit={() => handleFetch(url)}
                                isLoading={state.isLoading}
                                onPaste={handlePaste} // Assuming handlePaste is defined
                                platformColor={platformColor}
                            />
                        </View>
                    </View>
                )}

                {/* Error Message */}
                {state.fetchError && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>⚠️ Unable to fetch</Text>
                        <Text style={styles.errorText}>{state.fetchError}</Text>
                    </View>
                )}

                {/* Download Progress */}
                {(state.isDownloading || isLosslessDownloading) && (
                    <View style={styles.progressSection}>
                        <DownloadProgress
                            progress={state.downloadProgress}
                            eta={state.downloadEta}
                            onCancel={handleCancelDownload}
                            title={isLosslessDownloading ? `🎵 ${state.videoInfo?.title || 'Lossless FLAC'}` : state.videoInfo?.title}
                            platformColor={isLosslessDownloading ? Colors.lossless : platformColor}
                            statusLine={state.downloadLine}
                        />
                    </View>
                )}

                {/* Batch Download Progress */}
                {isBatchDownloading && batchItems.length > 0 && (
                    <BatchDownloadProgress
                        items={batchItems}
                        totalItems={batchItems.length}
                        completedCount={batchItems.filter((i) => i.status === 'completed').length}
                        failedCount={batchItems.filter((i) => i.status === 'failed').length}
                        currentTitle={batchCurrentTitle}
                        onCancel={() => {
                            batchActiveRef.current = false;
                            actions.cancelDownload();
                            setIsBatchDownloading(false);
                            setBatchItems([]);
                            ToastAndroid.show('Batch download cancelled', ToastAndroid.SHORT);
                        }}
                        onClose={() => {
                            batchActiveRef.current = false;
                            setIsBatchDownloading(false);
                            setBatchItems([]);
                        }}
                        platformColor={platformColor}
                    />
                )}

                {/* Skeleton Loading */}
                {state.isLoading && (
                    <View style={styles.videoSection}>
                        <SkeletonCard />
                    </View>
                )}

                {/* Video Info & Downloads */}
                {state.videoInfo && !state.isLoading && !state.isDownloading && !isLosslessDownloading && (
                    <>
                        {/* ... Info Card ... */}
                        <View style={styles.videoSection}>
                            <VideoInfoCard
                                videoInfo={state.videoInfo}
                                onSaveThumbnail={handleSaveThumbnail}
                            />
                        </View>

                        {/* Lossless FLAC Card (Spotify only) */}
                        {(isCheckingLossless || (losslessAvailability && losslessAvailability.available)) && (
                            <LosslessCard
                                availability={losslessAvailability || { available: false, source: 'none' }}
                                isLoading={isCheckingLossless}
                                onDownload={handleLosslessDownload}
                                title={state.videoInfo.title}
                                artist={state.videoInfo.uploader}
                                platformColor={platformColor}
                            />
                        )}

                        {/* Quick Action - Platform Auto-Detect */}
                        <View style={styles.quickActionContainer}>
                            <TouchableOpacity
                                style={[styles.quickDownloadBtn, { backgroundColor: platformColor }]}
                                onPress={() => {
                                    // Auto-detect: Spotify/SoundCloud = audio, others = video
                                    const isAudioPlatform = detectedPlatform === 'spotify' || detectedPlatform === 'soundcloud';
                                    handleDownload(isAudioPlatform ? 'audio_mp3' : 'best');
                                }}
                            >
                                <DownloadIcon size={20} color="#FFF" />
                                <Text style={styles.quickDownloadText}>
                                    Download {(detectedPlatform === 'spotify' || detectedPlatform === 'soundcloud') ? 'Audio (MP3)' : 'Best Quality'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.downloadHeader}>
                            <DownloadIcon size={16} color={Colors.textMuted} />
                            <Text style={styles.downloadHeaderText}>ALL FORMATS</Text>
                        </View>

                        <FormatList
                            formats={state.videoInfo.formats}
                            onSelectFormat={handleDownload}
                            platformColor={platformColor}
                        />
                    </>
                )}

                {/* Animated Empty State */}
                {!state.videoInfo && !state.isLoading && !state.fetchError && !url && (
                    <EmptyState platform={detectedPlatform} isOffline={isOffline} />
                )}

                {/* Playlist Modal */}
                <PlaylistSelectionModal
                    visible={playlistModalVisible}
                    onClose={() => setPlaylistModalVisible(false)}
                    onDownload={handleBatchDownload}
                    playlistTitle={playlistTitle}
                    playlistImage={playlistImage}
                    items={playlistItems}
                    platformColor={platformColor}
                    isLoading={isPlaylistLoading}
                />

                {/* Update Modal */}
                {updateInfo && (
                    <UpdateModal
                        visible={updateModalVisible}
                        onClose={() => setUpdateModalVisible(false)}
                        version={updateInfo.version}
                        releaseUrl={updateInfo.releaseUrl}
                        downloadUrl={updateInfo.downloadUrl}
                        features={updateInfo.features}
                    />
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.xxl,
    },
    // ── Modern Header ──
    header: {
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    headerBrand: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },


    logo: {
        fontSize: 26,
        fontWeight: '900',
        color: Colors.textPrimary,
        letterSpacing: -1,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    tagline: {
        color: Colors.textMuted,
        fontSize: 13,
        marginTop: 8,
        letterSpacing: 0.2,
    },
    // ── Input Section ──
    inputSection: {
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    inputRow: {
        marginBottom: Spacing.sm,
    },
    // ── Quick Action ──
    quickActionContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
    },
    quickDownloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        gap: Spacing.sm,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    quickDownloadText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    // ── Error ──
    errorContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        backgroundColor: `${Colors.error}08`,
        borderRadius: 16,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: `${Colors.error}25`,
    },
    errorTitle: {
        color: Colors.error,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    errorText: {
        color: Colors.errorLight,
        fontSize: 13,
        lineHeight: 18,
    },
    // ── Progress ──
    progressSection: {
        marginTop: Spacing.lg,
    },
    videoSection: {
        marginTop: Spacing.xl,
        marginHorizontal: Spacing.md,
    },
    // ── Downloads ──
    downloadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xl,
        marginBottom: Spacing.md,
        marginHorizontal: Spacing.md,
        paddingHorizontal: Spacing.sm,
    },
    downloadHeaderText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    // ── Offline ──
    offlineContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.xl,
        backgroundColor: `${Colors.surfaceElevated}`,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.xl,
        alignItems: 'center',
        ...Shadows.lg,
    },
    offlineHero: {
        alignItems: 'center',
        gap: Spacing.md,
    },
    offlineIcon: {
        fontSize: 48,
        marginBottom: Spacing.sm,
    },
    offlineTitle: {
        color: Colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        textAlign: 'center',
    },
    offlineSubtitle: {
        color: Colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 280,
    },
    offlineWarning: {
        color: Colors.error,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        marginTop: 20,
    },
    offlineActionRow: {
        marginTop: 24,
    },
    offlineGlow: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: Colors.error,
        opacity: 0.05,
    },
    offlineBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
        ...Shadows.md,
    },
    offlineBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.5,
    }
});

export default HomeScreen;
