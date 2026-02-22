/**
 * Premium VideoInfoCard - Display fetched video metadata with glassmorphism
 */
import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Dimensions,
    Animated,
    TouchableOpacity,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows, getPlatformColor } from '../theme';
import { VideoInfo } from '../native/YtDlpModule';
import { formatDuration, formatViewCount } from '../native/YtDlpModule';
import { PlayIcon, ImageIcon } from './Icons';

interface VideoInfoCardProps {
    videoInfo: VideoInfo;
    onSaveThumbnail?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - Spacing.md * 2;
const THUMBNAIL_HEIGHT = (CARD_WIDTH) * (9 / 16);

export const VideoInfoCard: React.FC<VideoInfoCardProps> = ({ videoInfo, onSaveThumbnail }) => {
    const platformColor = getPlatformColor(videoInfo.platform);
    const height = videoInfo.height ?? 0;
    const hasResolution = height > 0;
    const is4K = height >= 2160;
    const is2K = height >= 1440 && height < 2160;
    const isHD = height >= 720 && height < 1440;

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const getQualityLabel = () => {
        if (is4K) return '4K';
        if (is2K) return '2K';
        if (height) return `${height}p`;
        return null;
    };

    const getQualityColor = () => {
        if (is4K) return '#A855F7'; // Purple
        if (is2K) return Colors.secondary;
        if (isHD) return Colors.success;
        return Colors.primary;
    };

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                }
            ]}
        >
            {/* Platform Accent Line */}
            <View style={[styles.accentLine, { backgroundColor: platformColor }]} />

            {/* Thumbnail */}
            <View style={styles.thumbnailContainer}>
                {videoInfo.thumbnail ? (
                    <Image
                        source={{ uri: videoInfo.thumbnail }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                        <PlayIcon size={48} color={Colors.textMuted} />
                    </View>
                )}

                {/* Gradient Overlay */}
                <View style={styles.thumbnailGradient} />

                {/* Duration Badge */}
                {videoInfo.duration > 0 && (
                    <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>
                            {formatDuration(videoInfo.duration)}
                        </Text>
                    </View>
                )}

                {/* Quality Badge */}
                {hasResolution && (
                    <View style={[styles.qualityBadge, { backgroundColor: getQualityColor() }]}>
                        <Text style={styles.qualityText}>{getQualityLabel()}</Text>
                    </View>
                )}

                {/* Save Thumbnail Button */}
                {onSaveThumbnail && videoInfo.thumbnail && (
                    <TouchableOpacity
                        style={styles.saveThumbnailButton}
                        onPress={onSaveThumbnail}
                        activeOpacity={0.8}
                    >
                        <ImageIcon size={16} color={Colors.textPrimary} />
                    </TouchableOpacity>
                )}

                {/* Platform Badge */}
                <View style={styles.platformBadge}>
                    <View style={[styles.platformDot, { backgroundColor: platformColor }]} />
                    <Text style={styles.platformText}>{videoInfo.platform || 'Unknown'}</Text>
                </View>
            </View>

            {/* Info Section */}
            <View style={styles.infoContainer}>
                <Text style={styles.title} numberOfLines={2}>
                    {videoInfo.title}
                </Text>

                <View style={styles.metaContainer}>
                    <Text style={styles.uploader} numberOfLines={1}>
                        {videoInfo.uploader}
                    </Text>

                    {videoInfo.viewCount > 0 && (
                        <>
                            <Text style={styles.metaDivider}>•</Text>
                            <Text style={styles.metaText}>
                                {formatViewCount(videoInfo.viewCount)} views
                            </Text>
                        </>
                    )}
                </View>

                {/* Stats Row */}
                <View style={styles.statsRow}>
                    {videoInfo.likeCount > 0 && (
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {formatViewCount(videoInfo.likeCount)}
                            </Text>
                            <Text style={styles.statLabel}>likes</Text>
                        </View>
                    )}

                    {videoInfo.duration > 0 && (
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {Math.floor(videoInfo.duration / 60)}
                            </Text>
                            <Text style={styles.statLabel}>min</Text>
                        </View>
                    )}

                    {hasResolution && (
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: getQualityColor() }]}>
                                {getQualityLabel()}
                            </Text>
                            <Text style={styles.statLabel}>quality</Text>
                        </View>
                    )}
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: Colors.surfaceMedium,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        ...Shadows.lg,
    },
    accentLine: {
        height: 2,
        width: '100%',
        opacity: 0.8,
    },
    thumbnailContainer: {
        position: 'relative',
    },
    thumbnail: {
        width: '100%',
        height: THUMBNAIL_HEIGHT,
        backgroundColor: Colors.surfaceLow,
    },
    thumbnailPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    thumbnailGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        backgroundColor: 'transparent',
    },
    durationBadge: {
        position: 'absolute',
        bottom: Spacing.sm,
        right: Spacing.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    durationText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: 0.8,
    },
    qualityBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    qualityText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.black,
        letterSpacing: 1,
    },
    saveThumbnailButton: {
        position: 'absolute',
        top: Spacing.sm,
        right: Spacing.sm,
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    platformBadge: {
        position: 'absolute',
        bottom: Spacing.sm,
        left: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        borderRadius: BorderRadius.round,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    platformDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    platformText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.semibold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    infoContainer: {
        padding: Spacing.md,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.semibold,
        lineHeight: 22,
        marginBottom: Spacing.xs,
        letterSpacing: Typography.letterSpacing.normal,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    uploader: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
        flex: 1,
    },
    metaDivider: {
        color: Colors.textMuted,
        marginHorizontal: Spacing.xs,
        fontSize: Typography.sizes.sm,
    },
    metaText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
        letterSpacing: -0.2,
    },
    statsRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorder,
        paddingTop: Spacing.md,
        gap: Spacing.xl,
    },
    statItem: {
        alignItems: 'flex-start',
    },
    statValue: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    },
    statLabel: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xxs,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
    },
});

export default VideoInfoCard;
