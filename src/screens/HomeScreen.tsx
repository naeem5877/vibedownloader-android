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
} from '../components';
// FormatToggle removed - automatic mode detection
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { DiscordButton } from '../components/DiscordButton';
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat, ytDlpEventEmitter, YtDlpNative } from '../native/YtDlpModule';
import { DownloadIcon, SparkleIcon, ShareIcon, GitHubIcon, DesktopIcon, StarIcon, WaveformIcon } from '../components/Icons';
import { checkForUpdates, UpdateInfo } from '../services/GitHubUpdateService';
import { getSpotifyPlaylist, extractSpotifyId, getTrackInfo, buildYouTubeSearchQuery, formatTrackMetadata } from '../services/SpotifyService';
import { detectPlatform } from '../utils/platform';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

    // Animation refs
    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;
    const emptyFadeAnim = useRef(new Animated.Value(0)).current;
    const emptySlideAnim = useRef(new Animated.Value(30)).current;
    const pillAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;
    const orbAnim1 = useRef(new Animated.Value(0)).current;
    const orbAnim2 = useRef(new Animated.Value(0)).current;

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

        // Empty state entrance
        Animated.parallel([
            Animated.timing(emptyFadeAnim, {
                toValue: 1,
                duration: 800,
                delay: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(emptySlideAnim, {
                toValue: 0,
                tension: 40,
                friction: 8,
                delay: 300,
                useNativeDriver: true,
            }),
        ]).start();

        // Staggered pill animations
        pillAnims.forEach((anim, index) => {
            Animated.spring(anim, {
                toValue: 1,
                tension: 50,
                friction: 8,
                delay: 600 + index * 100,
                useNativeDriver: true,
            }).start();
        });

        // Floating orb animations
        Animated.loop(
            Animated.sequence([
                Animated.timing(orbAnim1, { toValue: -15, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(orbAnim1, { toValue: 15, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
        Animated.loop(
            Animated.sequence([
                Animated.timing(orbAnim2, { toValue: 12, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(orbAnim2, { toValue: -12, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

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
                {/* Modern Header */}
                <Animated.View
                    style={[
                        styles.header,
                        { opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }
                    ]}
                >
                    <View style={styles.headerTop}>
                        <View style={styles.headerBrand}>
                            <View style={styles.logoGlow} />
                            <Text style={styles.logo}>Vibe</Text>
                            <Text style={[styles.logo, styles.logoAccent]}>Downloader</Text>
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

                {/* URL Input */}
                <View style={styles.inputSection}>
                    <View style={styles.inputRow}>
                        <URLInput
                            value={url}
                            onChangeText={(text) => {
                                setUrl(text);
                                if (text.trim().length === 0) {
                                    setUserSelectedPlatform(false);
                                    setDetectedPlatform('YouTube');
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

                {/* Animated Empty State */}
                {!state.videoInfo && !state.isLoading && !state.fetchError && !url && (
                    <Animated.View style={[
                        styles.emptyState,
                        { opacity: emptyFadeAnim, transform: [{ translateY: emptySlideAnim }] }
                    ]}>
                        {/* Floating Orbs */}
                        <Animated.View style={[styles.emptyOrb, styles.emptyOrbPrimary, { transform: [{ translateY: orbAnim1 }] }]} />
                        <Animated.View style={[styles.emptyOrb, styles.emptyOrbSecondary, { transform: [{ translateY: orbAnim2 }] }]} />

                        <View style={styles.emptyIconContainer}>
                            <View style={styles.emptyIconGlow} />
                            <View style={styles.emptyIconRing}>
                                <SparkleIcon size={44} color={Colors.primary} />
                            </View>
                        </View>
                        <Text style={styles.emptyTitle}>Universal Downloader</Text>
                        <Text style={styles.emptySubtitle}>
                            Paste a link from YouTube, Instagram, TikTok, Spotify, and more
                        </Text>

                        {/* Animated Feature Pills */}
                        <View style={styles.featurePills}>
                            {['🎬 4K Video', '🎵 MP3 Audio', '📸 Photos', '🔗 8+ Platforms', '⚡ Fast'].map((label, i) => (
                                <Animated.View
                                    key={label}
                                    style={[
                                        styles.featurePill,
                                        {
                                            opacity: pillAnims[i],
                                            transform: [{
                                                scale: pillAnims[i].interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0.7, 1],
                                                }),
                                            }],
                                        },
                                    ]}
                                >
                                    <Text style={styles.featurePillText}>{label}</Text>
                                </Animated.View>
                            ))}
                        </View>
                    </Animated.View>
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
    logoGlow: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.primary,
        opacity: 0.08,
        left: -10,
        top: -12,
    },
    logo: {
        fontSize: 24,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    logoAccent: {
        color: Colors.primary,
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
    // ── Animated Empty State ──
    emptyState: {
        alignItems: 'center',
        marginTop: 48,
        paddingHorizontal: 28,
        position: 'relative',
        minHeight: 360,
    },
    emptyOrb: {
        position: 'absolute',
        borderRadius: 100,
        opacity: 0.1,
    },
    emptyOrbPrimary: {
        width: 150,
        height: 150,
        backgroundColor: Colors.primary,
        top: -20,
        left: -10,
    },
    emptyOrbSecondary: {
        width: 100,
        height: 100,
        backgroundColor: Colors.secondary,
        bottom: 40,
        right: 0,
    },
    emptyIconContainer: {
        marginBottom: 24,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIconGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: Colors.primary,
        opacity: 0.12,
    },
    emptyIconRing: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: `${Colors.primary}0A`,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: `${Colors.primary}20`,
    },
    emptyTitle: {
        color: Colors.textPrimary,
        fontSize: 26,
        fontWeight: '800',
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    emptySubtitle: {
        color: Colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
        maxWidth: 300,
    },
    featurePills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
    },
    featurePill: {
        backgroundColor: Colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    featurePillText: {
        color: Colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
});

export default HomeScreen;
