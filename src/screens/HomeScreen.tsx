/**
 * HomeScreen - Main screen for VibeDownloader Mobile
 */
import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import {
    PlatformSelector,
    URLInput,
    VideoInfoCard,
    FormatList,
    DownloadProgress,
    YouTubeIcon,
} from '../components';
import { useYtDlp } from '../hooks/useYtDlp';
import { VideoFormat } from '../native/YtDlpModule';

export const HomeScreen: React.FC = () => {
    const [url, setUrl] = useState('');
    const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

    const [state, actions] = useYtDlp();

    // Request permissions on mount
    useEffect(() => {
        requestPermissions();
    }, []);

    const requestPermissions = async () => {
        if (Platform.OS !== 'android') return;

        try {
            const sdkInt = Platform.Version;

            if (sdkInt >= 33) {
                // Android 13+ - Request media permissions
                const permissions = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                ]);
                console.log('Permissions:', permissions);
            } else {
                // Android 12 and below
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Permission',
                        message: 'VibeDownloader needs access to save downloaded files.',
                        buttonNeutral: 'Ask Me Later',
                        buttonNegative: 'Cancel',
                        buttonPositive: 'OK',
                    },
                );
                console.log('Storage permission:', granted);
            }
        } catch (err) {
            console.warn('Permission request error:', err);
        }
    };

    // Validate URL and detect platform when URL changes
    useEffect(() => {
        const validateAndDetect = async () => {
            if (url.trim().length > 10) {
                try {
                    const result = await actions.validateUrl(url);
                    setDetectedPlatform(result.platform);
                } catch {
                    setDetectedPlatform(null);
                }
            } else {
                setDetectedPlatform(null);
            }
        };

        const timer = setTimeout(validateAndDetect, 500);
        return () => clearTimeout(timer);
    }, [url, actions]);

    const handleFetch = useCallback(async () => {
        if (!url.trim()) {
            ToastAndroid.show('Please enter a URL', ToastAndroid.SHORT);
            return;
        }

        // Validate URL first
        const validation = await actions.validateUrl(url);
        if (!validation.valid) {
            Alert.alert(
                'Unsupported Platform',
                'This URL is not from a supported platform.\n\nSupported: YouTube, Instagram, Facebook, TikTok, Spotify, X, Pinterest, SoundCloud',
            );
            return;
        }

        await actions.fetchInfo(url);
    }, [url, actions]);

    const handleDownload = useCallback(async (format: VideoFormat) => {
        if (!state.videoInfo) return;

        const formatId = format.formatId || null;

        ToastAndroid.show('Starting download...', ToastAndroid.SHORT);

        const result = await actions.download(state.videoInfo.url, formatId);

        if (result) {
            ToastAndroid.show('Download complete!', ToastAndroid.LONG);
            Alert.alert(
                'Download Complete',
                `File saved to:\n${result.outputDir}`,
                [{ text: 'OK' }],
            );
        }
    }, [state.videoInfo, actions]);

    const handleCancelDownload = useCallback(async () => {
        Alert.alert(
            'Cancel Download',
            'Are you sure you want to cancel this download?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: () => {
                        actions.cancelDownload();
                        ToastAndroid.show('Download cancelled', ToastAndroid.SHORT);
                    },
                },
            ],
        );
    }, [actions]);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.logo}>
                        <Text style={styles.logoVibe}>Vibe</Text>
                        <Text style={styles.logoDownloader}>Downloader</Text>
                    </Text>
                    <Text style={styles.subtitle}>
                        Download from {detectedPlatform || 'YouTube'}
                    </Text>
                </View>

                {/* Platform Selector */}
                <PlatformSelector
                    selectedPlatform={detectedPlatform}
                />

                {/* URL Input */}
                <View style={styles.inputSection}>
                    <URLInput
                        value={url}
                        onChangeText={setUrl}
                        onSubmit={handleFetch}
                        isLoading={state.isLoading}
                    />
                </View>

                {/* Error Message */}
                {state.fetchError && (
                    <View style={styles.errorContainer}>
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
                        />
                    </View>
                )}

                {/* Video Info */}
                {state.videoInfo && !state.isDownloading && (
                    <>
                        <View style={styles.videoSection}>
                            <VideoInfoCard videoInfo={state.videoInfo} />
                        </View>

                        {/* Download Options Header */}
                        <View style={styles.downloadHeader}>
                            <Text style={styles.downloadHeaderText}>DOWNLOAD OPTIONS</Text>
                        </View>

                        {/* Format List */}
                        <FormatList
                            formats={state.videoInfo.formats}
                            onSelectFormat={handleDownload}
                        />
                    </>
                )}

                {/* Empty State */}
                {!state.videoInfo && !state.isLoading && !state.fetchError && (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <YouTubeIcon size={48} color={Colors.primary} />
                        </View>
                        <Text style={styles.emptyTitle}>Ready to Download</Text>
                        <Text style={styles.emptySubtitle}>
                            Videos, reels & playlists
                        </Text>

                        <View style={styles.howToSection}>
                            <Text style={styles.howToTitle}>HOW TO DOWNLOAD</Text>

                            <View style={styles.howToStep}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>1</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Copy the link</Text>
                                    <Text style={styles.stepDescription}>
                                        Copy the video or playlist URL from YouTube
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.howToStep}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>2</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Paste and fetch</Text>
                                    <Text style={styles.stepDescription}>
                                        Paste the link above and tap FETCH
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.howToStep}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>3</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Choose quality</Text>
                                    <Text style={styles.stepDescription}>
                                        Select your preferred quality and download
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Powered by </Text>
                    <Text style={styles.footerBold}>yt-dlp</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
    },
    logo: {
        fontSize: Typography.sizes['3xl'],
        fontWeight: Typography.weights.bold,
    },
    logoVibe: {
        color: Colors.textPrimary,
    },
    logoDownloader: {
        color: Colors.primary,
    },
    subtitle: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.base,
        marginTop: Spacing.xs,
    },
    inputSection: {
        marginTop: Spacing.md,
    },
    errorContainer: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.error,
    },
    errorText: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
        textAlign: 'center',
    },
    progressSection: {
        marginTop: Spacing.lg,
    },
    videoSection: {
        marginTop: Spacing.xl,
    },
    downloadHeader: {
        marginTop: Spacing.xl,
        marginHorizontal: Spacing.md,
        paddingHorizontal: Spacing.sm,
    },
    downloadHeaderText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
        letterSpacing: 1,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: Spacing.xxl,
        paddingHorizontal: Spacing.lg,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 0, 80, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes['2xl'],
        fontWeight: Typography.weights.bold,
        marginBottom: Spacing.xs,
    },
    emptySubtitle: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.base,
        marginBottom: Spacing.xxl,
    },
    howToSection: {
        width: '100%',
        marginTop: Spacing.lg,
    },
    howToTitle: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
        letterSpacing: 1,
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    howToStep: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    stepNumberText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        marginBottom: 2,
    },
    stepDescription: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xxl,
        paddingVertical: Spacing.lg,
    },
    footerText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
    },
    footerBold: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.bold,
    },
});

export default HomeScreen;
