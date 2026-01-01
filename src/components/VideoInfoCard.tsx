/**
 * VideoInfoCard - Display fetched video metadata
 */
import React from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows, getPlatformColor } from '../theme';
import { VideoInfo } from '../native/YtDlpModule';
import { formatDuration, formatViewCount } from '../native/YtDlpModule';

interface VideoInfoCardProps {
    videoInfo: VideoInfo;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - Spacing.md * 2;
const THUMBNAIL_HEIGHT = (CARD_WIDTH - Spacing.md * 2) * (9 / 16);

export const VideoInfoCard: React.FC<VideoInfoCardProps> = ({ videoInfo }) => {
    const platformColor = getPlatformColor(videoInfo.platform);
    const hasResolution = videoInfo.height > 0;
    const is4K = videoInfo.height >= 2160;
    const is2K = videoInfo.height >= 1440 && videoInfo.height < 2160;

    return (
        <View style={styles.container}>
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
                        <Text style={styles.noThumbnailText}>No thumbnail</Text>
                    </View>
                )}

                {/* Duration badge */}
                {videoInfo.duration > 0 && (
                    <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>
                            {formatDuration(videoInfo.duration)}
                        </Text>
                    </View>
                )}

                {/* Quality badge */}
                {hasResolution && (
                    <View style={[styles.qualityBadge, is4K && styles.qualityBadge4K]}>
                        <Text style={styles.qualityText}>
                            {is4K ? '4K' : is2K ? '2K' : `${videoInfo.height}p`}
                        </Text>
                    </View>
                )}
            </View>

            {/* Info */}
            <View style={styles.infoContainer}>
                <Text style={styles.title} numberOfLines={2}>
                    {videoInfo.title}
                </Text>

                <View style={styles.metaRow}>
                    <View style={[styles.platformDot, { backgroundColor: platformColor }]} />
                    <Text style={styles.metaText}>{videoInfo.uploader}</Text>
                    {videoInfo.viewCount > 0 && (
                        <>
                            <Text style={styles.metaDivider}>•</Text>
                            <Text style={styles.metaText}>
                                {formatViewCount(videoInfo.viewCount)} views
                            </Text>
                        </>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        ...Shadows.md,
    },
    thumbnailContainer: {
        position: 'relative',
    },
    thumbnail: {
        width: '100%',
        height: THUMBNAIL_HEIGHT,
        backgroundColor: Colors.surfaceElevated,
    },
    thumbnailPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    noThumbnailText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
    },
    durationBadge: {
        position: 'absolute',
        bottom: Spacing.sm,
        right: Spacing.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    durationText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.medium,
    },
    qualityBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        backgroundColor: Colors.primary,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    qualityBadge4K: {
        backgroundColor: '#9333ea', // Purple for 4K
    },
    qualityText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
    },
    infoContainer: {
        padding: Spacing.md,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.semibold,
        lineHeight: 24,
        marginBottom: Spacing.sm,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    platformDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: Spacing.sm,
    },
    metaText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },
    metaDivider: {
        color: Colors.textMuted,
        marginHorizontal: Spacing.sm,
    },
});

export default VideoInfoCard;
