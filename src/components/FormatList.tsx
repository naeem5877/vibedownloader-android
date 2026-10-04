/**
 * Premium FormatList - Desktop Parity Download Options
 * Matches the clean, modern card design from VibeDownloader Desktop
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import { Colors, Spacing, BorderRadius, Typography } from '../theme';
import { DownloadIcon, MusicNoteIcon, VideoIcon } from './Icons';
import { VideoFormat } from '../native/YtDlpModule';

interface FormatListProps {
    formats: VideoFormat[];
    onSelectFormat: (format: VideoFormat | string) => void;
    onDownloadThumbnail?: () => void;
    platformColor?: string;
    /** Used to label Twitch with its real quality ladder instead of raw ids. */
    platform?: string;
}

/**
 * Renders a Twitch format id the way Twitch itself names its qualities.
 *
 * Twitch ids look like `1080p60`, `720p`, `160p` or `audio_only`, so the
 * resolution alone loses the frame rate that distinguishes e.g. 1080p60 from
 * 1080p. Anything unrecognised falls back to the height.
 */
export function formatTwitchQuality(format: VideoFormat): string {
    const id = (format.formatId ?? '').toLowerCase();
    if (id === 'audio_only' || format.hasAudio === true && format.hasVideo === false) {
        return 'Audio Only';
    }
    const match = id.match(/(\d+)p(\d+)?/);
    if (match) {
        const [, height, fps] = match;
        return fps ? `${height}p${fps}` : `${height}p`;
    }
    const h = format.height;
    if (!h) return format.formatId || 'Video';
    return format.fps ? `${h}p${Math.round(format.fps)}` : `${h}p`;
}

interface FormatCardProps {
    title: string;
    subtitle: string;
    badge?: string;
    badgeStyle?: {
        bg: string;
        text: string;
        border: string;
    };
    extraBadge?: string;
    extraBadgeStyle?: {
        bg: string;
        text: string;
        border: string;
    };
    icon: React.ReactNode;
    iconBg?: string;
    iconBorder?: string;
    onPress: () => void;
    delay: number;
    cardBorder?: string;
}

const FormatCard: React.FC<FormatCardProps> = ({
    title,
    subtitle,
    badge,
    badgeStyle,
    extraBadge,
    extraBadgeStyle,
    icon,
    iconBg = 'rgba(255, 255, 255, 0.05)',
    iconBorder = 'rgba(255, 255, 255, 0.08)',
    onPress,
    delay,
    cardBorder = 'rgba(255, 255, 255, 0.07)',
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(15)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 250,
                delay,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 60,
                friction: 9,
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
                    { borderColor: cardBorder },
                ]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.85}
            >
                {/* Left Icon */}
                <View style={[styles.iconContainer, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                    {icon}
                </View>

                {/* Info Text & Badges */}
                <View style={styles.formatInfo}>
                    <View style={styles.titleRow}>
                        <Text style={styles.formatTitle}>{title}</Text>
                        {extraBadge && extraBadgeStyle && (
                            <View style={[styles.badge, { backgroundColor: extraBadgeStyle.bg, borderColor: extraBadgeStyle.border }]}>
                                <Text style={[styles.badgeText, { color: extraBadgeStyle.text }]}>{extraBadge}</Text>
                            </View>
                        )}
                        {badge && badgeStyle && (
                            <View style={[styles.badge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
                                <Text style={[styles.badgeText, { color: badgeStyle.text }]}>{badge}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.formatSubtitle} numberOfLines={1}>{subtitle}</Text>
                </View>

                {/* Right Download Button */}
                <View style={styles.downloadButton}>
                    <DownloadIcon size={16} color="rgba(255, 255, 255, 0.7)" />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

export const FormatList: React.FC<FormatListProps> = ({
    formats,
    onSelectFormat,
    platform,
}) => {
    const isTwitch = (platform ?? '').toLowerCase() === 'twitch';

    // Process formats: Filter unique heights, prioritize MP4, sort by quality desc
    const videoFormats = useMemo(() => {
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
            .filter((f) => f.vcodec !== 'none' && f.height && f.height >= 144)
            .reduce((acc, current) => {
                const existing = acc.find(
                    (item) => item.height === current.height
                );
                if (!existing) {
                    return acc.concat([current]);
                } else {
                    // Twitch publishes several frame rates at the same height
                    // (1080p60 vs 1080p30), so the higher frame rate wins rather
                    // than whichever container happens to sort first.
                    if (isTwitch) {
                        return (current.fps ?? 0) > (existing.fps ?? 0)
                            ? acc.map(i => i === existing ? current : i)
                            : acc;
                    }
                    const curExtPriority = getExtPriority(current.ext);
                    const existingExtPriority = getExtPriority(existing.ext);

                    if (curExtPriority < existingExtPriority) {
                        return acc.map(i => i === existing ? current : i);
                    } else if (curExtPriority === existingExtPriority && (current.filesize || 0) > (existing.filesize || 0)) {
                        return acc.map(i => i === existing ? current : i);
                    }
                    return acc;
                }
            }, [] as VideoFormat[])
            .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.fps || 0) - (a.fps || 0));

        return unique.slice(0, 7);
    }, [formats, isTwitch]);

    let animationDelay = 0;

    return (
        <View style={styles.container}>
            {/* Top Header - Desktop Parity */}
            <View style={styles.topHeader}>
                <Text style={styles.topHeaderTitle}>DOWNLOAD OPTIONS</Text>
                <Text style={styles.topHeaderSubtitle}>Select format & quality</Text>
            </View>

            {/* Section Header - Audio Only */}
            <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                    <MusicNoteIcon size={14} color="#10B981" />
                    <Text style={[styles.sectionTitle, { color: '#10B981' }]}>AUDIO ONLY</Text>
                </View>
            </View>

            {/* 1. Audio (WAV) - Uncompressed */}
            <FormatCard
                title="Audio (WAV)"
                subtitle="Uncompressed PCM • Full artist, album & year tags • No cover art"
                badge="UNCOMPRESSED"
                badgeStyle={{
                    bg: 'rgba(14, 165, 233, 0.15)',
                    border: 'rgba(14, 165, 233, 0.3)',
                    text: '#38BDF8',
                }}
                icon={<MusicNoteIcon size={18} color="#38BDF8" />}
                iconBg="rgba(14, 165, 233, 0.15)"
                iconBorder="rgba(14, 165, 233, 0.25)"
                cardBorder="rgba(14, 165, 233, 0.2)"
                onPress={() => onSelectFormat('audio_wav')}
                delay={animationDelay += 40}
            />

            {/* 2. Audio (Best Quality) - 320kbps MP3 */}
            <FormatCard
                title="Audio (Best Quality)"
                subtitle="~320kbps • Studio Grade High Bitrate MP3"
                badge="320KBPS MP3"
                badgeStyle={{
                    bg: 'rgba(16, 185, 129, 0.18)',
                    border: 'rgba(16, 185, 129, 0.35)',
                    text: '#34D399',
                }}
                icon={<MusicNoteIcon size={18} color="#10B981" />}
                iconBg="rgba(16, 185, 129, 0.15)"
                iconBorder="rgba(16, 185, 129, 0.25)"
                cardBorder="rgba(16, 185, 129, 0.2)"
                onPress={() => onSelectFormat('audio_best')}
                delay={animationDelay += 40}
            />

            {/* 3. Audio (Standard) - 128kbps */}
            <FormatCard
                title="Audio (Standard)"
                subtitle="~128kbps • Balanced Size & Quality"
                badge="128KBPS"
                badgeStyle={{
                    bg: 'rgba(20, 184, 166, 0.15)',
                    border: 'rgba(20, 184, 166, 0.25)',
                    text: '#2DD4BF',
                }}
                icon={<MusicNoteIcon size={18} color="#2DD4BF" />}
                iconBg="rgba(20, 184, 166, 0.12)"
                iconBorder="rgba(20, 184, 166, 0.2)"
                onPress={() => onSelectFormat('audio_standard')}
                delay={animationDelay += 40}
            />

            {/* 4. Audio (Low) - 64kbps */}
            <FormatCard
                title="Audio (Low)"
                subtitle="~64kbps • Save Data & Storage"
                badge="64KBPS"
                badgeStyle={{
                    bg: 'rgba(245, 158, 11, 0.15)',
                    border: 'rgba(245, 158, 11, 0.25)',
                    text: '#FBBF24',
                }}
                icon={<MusicNoteIcon size={18} color="#FBBF24" />}
                iconBg="rgba(245, 158, 11, 0.12)"
                iconBorder="rgba(245, 158, 11, 0.2)"
                onPress={() => onSelectFormat('audio_low')}
                delay={animationDelay += 40}
            />

            {/* Section Header - Video Quality */}
            {videoFormats.length > 0 && (
                <>
                    <View style={[styles.sectionHeaderRow, { marginTop: Spacing.lg }]}>
                        <View style={styles.sectionHeaderLeft}>
                            <VideoIcon size={14} color="#3B82F6" />
                            <Text style={[styles.sectionTitle, { color: '#3B82F6' }]}>VIDEO QUALITY</Text>
                        </View>
                        <Text style={styles.sectionHeaderRight}>{videoFormats.length} OPTIONS</Text>
                    </View>

                    {videoFormats.map((format, index) => {
                        const h = format.height || 0;
                        const is4K = h >= 2160;
                        const is2K = h >= 1440 && h < 2160;
                        const is1080 = h >= 1080 && h < 1440;
                        const is720 = h >= 720 && h < 1080;

                        let badgeText: string | undefined;
                        let badgeStyle: { bg: string; text: string; border: string } | undefined;
                        let iconColor = '#38BDF8';
                        let cardBorder = 'rgba(255, 255, 255, 0.07)';

                        if (is4K) {
                            badgeText = '4K ULTRA HD';
                            badgeStyle = { bg: 'rgba(168, 85, 247, 0.2)', border: 'rgba(168, 85, 247, 0.35)', text: '#C084FC' };
                            iconColor = '#C084FC';
                            cardBorder = 'rgba(168, 85, 247, 0.2)';
                        } else if (is2K) {
                            badgeText = '2K QHD';
                            badgeStyle = { bg: 'rgba(99, 102, 241, 0.2)', border: 'rgba(99, 102, 241, 0.35)', text: '#818CF8' };
                            iconColor = '#818CF8';
                            cardBorder = 'rgba(99, 102, 241, 0.2)';
                        } else if (is1080) {
                            badgeText = '1080P FHD';
                            badgeStyle = { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgba(59, 130, 246, 0.3)', text: '#60A5FA' };
                            iconColor = '#60A5FA';
                            cardBorder = 'rgba(59, 130, 246, 0.2)';
                        } else if (is720) {
                            badgeText = '720P HD';
                            badgeStyle = { bg: 'rgba(14, 165, 233, 0.18)', border: 'rgba(14, 165, 233, 0.3)', text: '#38BDF8' };
                            iconColor = '#38BDF8';
                        }

                        const extraBadgeText = index === 0 ? 'BEST QUALITY' : undefined;
                        const extraBadgeStyle = index === 0 ? {
                            bg: 'rgba(255, 255, 255, 0.12)',
                            border: 'rgba(255, 255, 255, 0.2)',
                            text: 'rgba(255, 255, 255, 0.9)',
                        } : undefined;

return (
<FormatCard
      key={`${format.formatId}-${index}`}
       title={isTwitch ? formatTwitchQuality(format) : `${h}p`}
      subtitle={
          isTwitch
              ? `${format.ext?.toUpperCase() || 'MP4'}${format.fps ? ` • ${Math.round(format.fps)} fps` : ''}`
              : `${format.ext?.toUpperCase() || 'MP4'} • ${h}p`
      }
      badge={isTwitch ? (index === 0 ? 'SOURCE' : badgeText) : badgeText}
                                badgeStyle={badgeStyle}
                                extraBadge={extraBadgeText}
                                extraBadgeStyle={extraBadgeStyle}
                                icon={<VideoIcon size={18} color={iconColor} />}
                                cardBorder={cardBorder}
                                onPress={() => onSelectFormat(format.formatId || 'best')}
                                delay={animationDelay += 35}
                            />
                        );
                    })}
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
        marginTop: Spacing.xs,
        paddingHorizontal: Spacing.xs,
    },
    topHeaderTitle: {
        color: 'rgba(255, 255, 255, 0.45)',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
    },
    topHeaderSubtitle: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 11,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
        marginTop: Spacing.xs,
        paddingHorizontal: Spacing.xs,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    sectionHeaderRight: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    formatCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F1216',
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderRadius: 14,
        borderWidth: 1,
    },
    iconContainer: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    formatInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 3,
    },
    formatTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    formatSubtitle: {
        color: 'rgba(255, 255, 255, 0.42)',
        fontSize: 11,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        borderWidth: 1,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    downloadButton: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
});

export default FormatList;
