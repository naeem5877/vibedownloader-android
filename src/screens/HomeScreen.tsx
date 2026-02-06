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
} from '../components';
// FormatToggle removed - automatic mode detection
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat, ytDlpEventEmitter, YtDlpNative } from '../native/YtDlpModule';
import { DownloadIcon, SparkleIcon, ShareIcon, GitHubIcon, DesktopIcon, StarIcon } from '../components/Icons';
import { checkForUpdates, UpdateInfo } from '../services/GitHubUpdateService';
import { getSpotifyPlaylist, extractSpotifyId, getTrackInfo, buildYouTubeSearchQuery, formatTrackMetadata } from '../services/SpotifyService';

export const HomeScreen: React.FC = () => {
    const [url, setUrl] = useState('');
    const [detectedPlatform, setDetectedPlatform] = useState<string | null>('youtube');
    const [userSelectedPlatform, setUserSelectedPlatform] = useState(false);
    // Removed downloadMode toggle - auto-detect based on platform (Spotify/SoundCloud = audio)

    // Playlist State
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [playlistItems, setPlaylistItems] = useState<any[]>([]);
    const [playlistTitle, setPlaylistTitle] = useState('');
    const [playlistImage, setPlaylistImage] = useState<string | undefined>(undefined);
    const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);

    // Update Modal State
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    const [state, actions] = useYtDlp();

    // ... refs ...
    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;

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
                    rawMetadata: metadata
                };

                actions.setVideoInfo(syntheticInfo);

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
                setUrl(text);
                // Optional: Auto-fetch on paste if it looks like a URL
                if (text.startsWith('http')) {
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
        if (detectedPlatform && PlatformThemes[detectedPlatform]) {
            return PlatformThemes[detectedPlatform];
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
                try {
                    const result = await actions.validateUrl(url);
                    // Only auto-update platform if user didn't manually select
                    if (!userSelectedPlatform) {
                        setDetectedPlatform(result.platform);
                    }
                } catch (error) {
                    console.warn('URL validation error:', error);
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

    const handleBatchDownload = async (selectedItems: any[], mode: 'video' | 'audio') => {
        setPlaylistModalVisible(false);
        ToastAndroid.show(`Starting ${selectedItems.length} downloads...`, ToastAndroid.SHORT);

        const formatId = mode === 'audio' ? 'audio_mp3' : null; // null = bestvideo+bestaudio

        // Fire and forget (native module handles queue)
        selectedItems.forEach(async (item, index) => {
            try {
                // Add small delay to prevent freezing UI?
                setTimeout(async () => {
                    if (item.type === 'spotify' && item.searchQuery) {
                        try {
                            await actions.downloadSpotifyTrack(
                                item.searchQuery,
                                item.title,
                                item.author,
                                item.thumbnail
                            );
                        } catch (e) {
                            console.error(`Failed to download Spotify track ${item.title}`, e);
                        }
                    } else {
                        await YtDlpNative.download(item.url, formatId, Math.random().toString(36).substring(7));
                    }
                }, index * 1000);
            } catch (e) {
                console.error(`Failed to start download for ${item.title}`, e);
            }
        });
    };

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
            <OfflineBanner />
            <StatusBar barStyle="light-content" backgroundColor={currentTheme.background} animated />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Premium Header */}
                <Animated.View
                    style={[
                        styles.header,
                        { opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }
                    ]}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <View>
                            <View style={styles.logoContainer}>
                                <Text style={[styles.logo, { color: Colors.primary }]}>VibeDownloader</Text>
                            </View>
                            <Text style={styles.tagline}>
                                Download from any platform, instantly
                            </Text>
                        </View>

                        {/* Header Actions */}
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                onPress={() => Share.share({ message: 'Check out VibeDownloader - The ultimate media downloader for Android! https://github.com/naeem5877/vibedownloader-android' })}
                                style={{ padding: 4 }}
                            >
                                <ShareIcon size={22} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => Linking.openURL('https://github.com/naeem5877/vibedownloader-android')}
                                style={{ padding: 4 }}
                            >
                                <StarIcon size={22} color="#FFD700" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => Linking.openURL('https://github.com/naeem5877/VibeDownloader')}
                                style={{ padding: 4 }}
                            >
                                <DesktopIcon size={22} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
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

                {/* URL Input */}
                <View style={styles.inputSection}>
                    <View style={styles.inputRow}>
                        <URLInput
                            value={url}
                            onChangeText={(text) => {
                                setUrl(text);
                                if (text.trim().length === 0) {
                                    setUserSelectedPlatform(false);
                                    setDetectedPlatform('youtube');
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

                {/* Error Message */}
                {state.fetchError && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>⚠️ Unable to fetch</Text>
                        <Text style={styles.errorText}>{state.fetchError}</Text>
                    </View>
                )}

                {/* Download Progress */}
                {state.isDownloading && (
                    <View style={styles.progressSection}>
                        <DownloadProgress
                            progress={state.downloadProgress}
                            eta={state.downloadEta}
                            onCancel={handleCancelDownload}
                            title={state.videoInfo?.title}
                            platformColor={platformColor}
                        />
                    </View>
                )}

                {/* Skeleton Loading */}
                {state.isLoading && (
                    <View style={styles.videoSection}>
                        <SkeletonCard />
                    </View>
                )}

                {/* Video Info & Downloads */}
                {state.videoInfo && !state.isLoading && !state.isDownloading && (
                    <>
                        {/* ... Info Card ... */}
                        <View style={styles.videoSection}>
                            <VideoInfoCard
                                videoInfo={state.videoInfo}
                                onSaveThumbnail={handleSaveThumbnail}
                            />
                        </View>

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

                {/* Premium Empty State */}
                {!state.videoInfo && !state.isLoading && !state.fetchError && !url && (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <SparkleIcon size={48} color={Colors.primary} />
                        </View>
                        <Text style={styles.emptyTitle}>Universal Downloader</Text>
                        <Text style={styles.emptySubtitle}>
                            Paste a link from YouTube, Instagram, TikTok, Spotify, and more.
                            Download videos, audio, and photos in the best quality.
                        </Text>

                        {/* Feature Pills */}
                        <View style={styles.featurePills}>
                            <View style={styles.featurePill}>
                                <Text style={styles.featurePillText}>🎬 4K Video</Text>
                            </View>
                            <View style={styles.featurePill}>
                                <Text style={styles.featurePillText}>🎵 MP3 Audio</Text>
                            </View>
                            <View style={styles.featurePill}>
                                <Text style={styles.featurePillText}>📸 Photos</Text>
                            </View>
                        </View>
                    </View>
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
    header: {
        alignItems: 'center',
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
        paddingHorizontal: Spacing.md,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    logo: {
        fontSize: Typography.sizes['3xl'],
        fontWeight: Typography.weights.bold,
    },
    betaBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.round,
    },
    betaText: {
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: 1,
    },
    tagline: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
        marginTop: Spacing.xs,
    },
    inputSection: {
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    inputRow: {
        marginBottom: Spacing.sm,
    },
    quickActionContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
    },
    quickDownloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        gap: Spacing.sm,
        ...Shadows.md,
    },
    quickDownloadText: {
        color: '#FFF',
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    },
    errorContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        backgroundColor: `${Colors.error}10`,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: `${Colors.error}30`,
    },
    errorTitle: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        marginBottom: 4,
    },
    errorText: {
        color: Colors.errorLight,
        fontSize: Typography.sizes.sm,
    },
    progressSection: {
        marginTop: Spacing.lg,
    },
    videoSection: {
        marginTop: Spacing.xl,
        marginHorizontal: Spacing.md,
    },
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
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: Typography.letterSpacing.widest,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: Spacing.xxxl,
        paddingHorizontal: Spacing.xl,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: `${Colors.primary}10`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes['2xl'],
        fontWeight: Typography.weights.bold,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    emptySubtitle: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.base,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: Spacing.lg,
    },
    featurePills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    featurePill: {
        backgroundColor: Colors.surface,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.round,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    featurePillText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
    },
});

export default HomeScreen;
