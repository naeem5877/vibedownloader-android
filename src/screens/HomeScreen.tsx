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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, Typography, PlatformThemes, getPlatformColor } from '../theme';
import {
    PlatformSelector,
    URLInput,
    VideoInfoCard,
    FormatList,
    DownloadProgress,
} from '../components';
import { SkeletonCard } from '../components/SkeletonCard';
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat, ytDlpEventEmitter } from '../native/YtDlpModule';
import { DownloadIcon, SparkleIcon } from '../components/Icons';

export const HomeScreen: React.FC = () => {
    const [url, setUrl] = useState('');
    const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

    const [state, actions] = useYtDlp();

    // Header animation
    const headerFadeAnim = useRef(new Animated.Value(0)).current;
    const headerSlideAnim = useRef(new Animated.Value(-20)).current;

    // --- Logic Actions ---

    const handleFetch = useCallback(async (text: string = url) => {
        if (!text.trim()) {
            ToastAndroid.show('Please enter a URL', ToastAndroid.SHORT);
            return;
        }

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
                    setDetectedPlatform(result.platform);
                } catch (error) {
                    console.warn('URL validation error:', error);
                    // Don't update platform on error
                }
            } else {
                setDetectedPlatform(null);
            }
        };

        const timer = setTimeout(validateAndDetect, 500);
        return () => clearTimeout(timer);
    }, [url, actions]);

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

        const appStateSubscription = AppState.addEventListener('change', nextAppState => {
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

    const handleDownload = useCallback(async (format: VideoFormat | string) => {
        if (!state.videoInfo) return;

        ToastAndroid.show('Starting download...', ToastAndroid.SHORT);

        try {
            const formatId = typeof format === 'string' ? format : format.formatId;
            const result = await actions.download(state.videoInfo.url, formatId);

            if (result) {
                ToastAndroid.show('Download complete!', ToastAndroid.LONG);
                Alert.alert(
                    '✅ Download Complete',
                    'Your file has been saved to the Movies folder.',
                    [{ text: 'OK' }],
                );
            }
        } catch (error: any) {
            console.error('Download error:', error);
            ToastAndroid.show(
                error?.message || 'Download failed',
                ToastAndroid.LONG
            );
        }
    }, [state.videoInfo, actions]);

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
            }
        } catch (error) {
            console.warn('Clipboard error:', error);
            ToastAndroid.show('Failed to paste from clipboard', ToastAndroid.SHORT);
        }
    }, [actions]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top']}>
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
                        {
                            opacity: headerFadeAnim,
                            transform: [{ translateY: headerSlideAnim }],
                        }
                    ]}
                >
                    <View style={styles.logoContainer}>
                        <Text style={[styles.logo, { color: platformColor }]}>VibeDownloader</Text>
                        <View style={[styles.betaBadge, { backgroundColor: `${platformColor}20` }]}>
                            <Text style={[styles.betaText, { color: platformColor }]}>BETA</Text>
                        </View>
                    </View>
                    <Text style={styles.tagline}>
                        Download from any platform, instantly
                    </Text>
                </Animated.View>

                {/* Platform Selector */}
                <PlatformSelector
                    selectedPlatform={detectedPlatform}
                    onSelectPlatform={(id) => setDetectedPlatform(id)}
                    disabled={state.isLoading || state.isDownloading}
                />

                {/* URL Input */}
                <View style={styles.inputSection}>
                    <URLInput
                        value={url}
                        onChangeText={setUrl}
                        onSubmit={() => handleFetch(url)}
                        isLoading={state.isLoading}
                        onPaste={handlePaste}
                        platformColor={platformColor}
                    />
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
                        <View style={styles.videoSection}>
                            <VideoInfoCard
                                videoInfo={state.videoInfo}
                                onSaveThumbnail={handleSaveThumbnail}
                            />
                        </View>

                        <View style={styles.downloadHeader}>
                            <DownloadIcon size={16} color={Colors.textMuted} />
                            <Text style={styles.downloadHeaderText}>AVAILABLE FORMATS</Text>
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
