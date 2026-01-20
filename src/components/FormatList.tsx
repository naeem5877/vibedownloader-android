/**
 * Premium FormatList - Download options with modern card design
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../theme';
import { DownloadIcon, MusicNoteIcon, VideoIcon, CheckIcon, SparkleIcon } from './Icons';
import { VideoFormat } from '../native/YtDlpModule';

interface FormatListProps {
    formats: VideoFormat[];
    onSelectFormat: (format: VideoFormat | string) => void;
    onDownloadThumbnail?: () => void;
    platformColor?: string;
}

interface FormatCardProps {
    title: string;
    subtitle: string;
    badge?: string;
    badgeColor?: string;
    icon: React.ReactNode;
    onPress: () => void;
    delay: number;
    isBest?: boolean;
    platformColor: string;
}

const FormatCard: React.FC<FormatCardProps> = ({
    title,
    subtitle,
    badge,
    badgeColor = Colors.primary,
    icon,
    onPress,
    delay,
    isBest,
    platformColor,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                delay,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                delay,
                useNativeDriver: true,
            }),
        ]).start();
    }, [delay]);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.98,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [
                    { translateY: slideAnim },
                    { scale: scaleAnim },
                ],
            }}
        >
            <TouchableOpacity
                style={[
                    styles.formatCard,
                    isBest && { borderColor: platformColor, borderWidth: 1.5 },
                ]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
            >
                {/* Best Indicator */}
                {isBest && (
                    <View style={[styles.bestIndicator, { backgroundColor: platformColor }]}>
                        <SparkleIcon size={10} color="#FFF" />
                        <Text style={styles.bestText}>BEST</Text>
                    </View>
                )}

                {/* Icon Container */}
                <View style={[styles.iconContainer, { backgroundColor: `${badgeColor}15` }]}>
                    {icon}
                </View>

                {/* Info */}
                <View style={styles.formatInfo}>
                    <Text style={styles.formatTitle}>{title}</Text>
                    <Text style={styles.formatSubtitle}>{subtitle}</Text>
                </View>

                {/* Badge */}
                {badge && (
                    <View style={[styles.badge, { backgroundColor: `${badgeColor}20` }]}>
                        <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
                    </View>
                )}

                {/* Download Icon */}
                <View style={styles.downloadButton}>
                    <DownloadIcon size={18} color={Colors.textSecondary} />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

export const FormatList: React.FC<FormatListProps> = ({
    formats,
    onSelectFormat,
    onDownloadThumbnail,
    platformColor = Colors.primary,
}) => {
    // Process formats: Filter unique, prioritize MP4, sort by quality
    const videoFormats = useMemo(() => {
        // Extension priority (MP4 preferred over WEBM)
        const extPriority: Record<string, number> = {
            'mp4': 1,
            'm4v': 2,
            'mov': 3,
            'webm': 4,
            'mkv': 5,
        };

        const getExtPriority = (ext: string | undefined) => {
            if (!ext) return 999;
            return extPriority[ext.toLowerCase()] || 10;
        };

        const unique = formats
            .filter((f) => f.vcodec !== 'none' && f.height && f.height >= 360)
            .reduce((acc, current) => {
                const existing = acc.find(
                    (item) => item.height === current.height
                );
                if (!existing) {
                    return acc.concat([current]);
                } else {
                    // Prioritize MP4 over other formats
                    const curExtPriority = getExtPriority(current.ext);
                    const existingExtPriority = getExtPriority(existing.ext);

                    if (curExtPriority < existingExtPriority) {
                        // Current has better extension (MP4 preferred)
                        return acc.map(i => i === existing ? current : i);
                    } else if (curExtPriority === existingExtPriority && (current.filesize || 0) > (existing.filesize || 0)) {
                        // Same extension, pick larger file
                        return acc.map(i => i === existing ? current : i);
                    }
                    return acc;
                }
            }, [] as VideoFormat[])
            .sort((a, b) => (b.height || 0) - (a.height || 0));

        return unique.slice(0, 5);
    }, [formats]);

    const formatFileSize = (bytes: number): string => {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
        return `${mb.toFixed(1)} MB`;
    };

    let animationDelay = 0;

    return (
        <View style={styles.container}>
            {/* Section Header - Audio */}
            <View style={styles.sectionHeader}>
                <MusicNoteIcon size={16} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>AUDIO ONLY</Text>
            </View>

            {/* Audio Options - Desktop Parity */}
            <FormatCard
                title="Best Quality MP3"
                subtitle="High Quality • 320kbps"
                badge="BEST"
                badgeColor={Colors.success}
                icon={<MusicNoteIcon size={20} color={Colors.success} />}
                onPress={() => onSelectFormat('audio_best')}
                delay={animationDelay += 50}
                platformColor={platformColor}
            />

            <FormatCard
                title="Standard MP3"
                subtitle="Balanced Quality • 192kbps"
                badge="MP3"
                badgeColor={Colors.info}
                icon={<MusicNoteIcon size={20} color={Colors.info} />}
                onPress={() => onSelectFormat('audio_standard')}
                delay={animationDelay += 50}
                platformColor={platformColor}
            />

            <FormatCard
                title="Low Quality MP3"
                subtitle="Faster Download • 128kbps"
                badge="LOW"
                badgeColor={Colors.textMuted}
                icon={<MusicNoteIcon size={20} color={Colors.textMuted} />}
                onPress={() => onSelectFormat('audio_low')}
                delay={animationDelay += 50}
                platformColor={platformColor}
            />

            {/* Section Header - Video */}
            <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
                <VideoIcon size={16} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>VIDEO QUALITY</Text>
            </View>

            {/* Auto Best Quality - First Option */}
            <FormatCard
                title="Auto Best Quality"
                subtitle="Highest available MP4 + Audio"
                badge="BEST"
                badgeColor={platformColor}
                icon={<SparkleIcon size={20} color={platformColor} />}
                onPress={() => onSelectFormat('best')}
                delay={animationDelay += 50}
                isBest={true}
                platformColor={platformColor}
            />

            {/* Video Options */}
            {videoFormats.map((format, index) => {
                const is4K = format.height && format.height >= 2160;
                const is2K = format.height && format.height >= 1440 && format.height < 2160;
                const isHD = format.height && format.height >= 720;

                let qualityColor = Colors.textMuted;
                if (is4K) qualityColor = '#A855F7';
                else if (is2K) qualityColor = Colors.secondary;
                else if (isHD) qualityColor = Colors.success;

                return (
                    <FormatCard
                        key={`${format.formatId}-${index}`}
                        title={`${format.height}p ${format.ext?.toUpperCase() || 'MP4'}`}
                        subtitle={format.filesize ? `~${formatFileSize(format.filesize)}` : 'Best Quality'}
                        badge={is4K ? '4K' : is2K ? '2K' : format.ext?.toUpperCase()}
                        badgeColor={qualityColor}
                        icon={<VideoIcon size={20} color={qualityColor} />}
                        onPress={() => onSelectFormat(format.formatId || 'best')}
                        delay={animationDelay += 50}
                        isBest={index === 0}
                        platformColor={platformColor}
                    />
                );
            })}

            {/* Fallback if no video formats */}
            {videoFormats.length === 0 && (
                <FormatCard
                    title="Auto Best Quality"
                    subtitle="MP4 Video"
                    badge="BEST"
                    badgeColor={Colors.primary}
                    icon={<VideoIcon size={20} color={Colors.primary} />}
                    onPress={() => onSelectFormat('bestvideo[ext=mp4]+bestaudio[ext=m4a]/best')}
                    delay={animationDelay += 50}
                    isBest={true}
                    platformColor={platformColor}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
        paddingLeft: Spacing.xs,
    },
    sectionTitle: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: Typography.letterSpacing.widest,
    },
    formatCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        position: 'relative',
        overflow: 'hidden',
    },
    bestIndicator: {
        position: 'absolute',
        top: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderBottomLeftRadius: BorderRadius.md,
        gap: 4,
    },
    bestText: {
        color: '#FFF',
        fontSize: 8,
        fontWeight: Typography.weights.bold,
        letterSpacing: 0.5,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    formatInfo: {
        flex: 1,
    },
    formatTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        marginBottom: 2,
    },
    formatSubtitle: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        marginRight: Spacing.md,
    },
    badgeText: {
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: 0.5,
    },
    downloadButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default FormatList;
