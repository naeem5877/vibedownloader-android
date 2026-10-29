/**
 * Premium FormatList - Desktop Parity Download Options
 *
 * Mirrors the desktop "Audio Only" / "Video Quality" cards. Contrast comes from
 * a per-row colour "tone": a left-to-right tinted gradient, a tinted border, a
 * matching icon tile and a bright badge pill, all on a transparent card so the
 * colour reads against the near-black page. Pressing a row does what hovering
 * does on desktop: tint and border brighten and the download button fills with
 * the row's accent.
 */
import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Spacing } from '../theme';
import { qualityHeight, qualityLabel } from '../utils/resolution';
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

/* ───────────────────────── tones ───────────────────────── */

/** Desktop's tint alphas are tuned for a monitor; phones want a touch more. */
const TINT_BOOST = 1.3;

const SKY = '14,165,233';
const EMERALD = '16,185,129';
const TEAL = '20,184,166';
const AMBER = '245,158,11';
const PURPLE = '168,85,247';
const INDIGO = '99,102,241';
const BLUE = '59,130,246';
const CYAN = '6,182,212';
const WHITE = '255,255,255';

const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;

interface Pill {
    text: string;
    bg: string;
    border: string;
    fg: string;
}

interface Tone {
    /** rgb triplet of the gradient tint */
    rgb: string;
    /** gradient start alpha, before TINT_BOOST */
    tint: number;
    /** resting and pressed border */
    border: string;
    borderPress: string;
    /** colour of the music/film glyph */
    icon: string;
    /** icon tile: tinted for audio rows, neutral for video rows */
    tileBg: string;
    tileBorder: string;
    /** title colour while pressed, and the download button's pressed fill */
    titlePress: string;
    btnPress: string;
}

const audioTone = (
    rgb: string,
    o: {
        tint: number;
        border: string;
        press: number;
        tile: number;
        tileBorder: number;
        icon: string;
        text: string;
        btn: string;
    },
): Tone => ({
    rgb,
    tint: o.tint,
    border: o.border,
    borderPress: rgba(rgb, o.press),
    icon: o.icon,
    tileBg: rgba(rgb, o.tile),
    tileBorder: rgba(rgb, o.tileBorder),
    titlePress: o.text,
    btnPress: o.btn,
});

const videoTone = (
    rgb: string,
    o: {
        tint: number;
        border: string;
        press: number;
        icon: string;
        text: string;
        btn: string;
    },
): Tone => ({
    rgb,
    tint: o.tint,
    border: o.border,
    borderPress: rgba(rgb, o.press),
    icon: o.icon,
    // Desktop video rows keep a neutral icon tile whatever the tier.
    tileBg: 'rgba(255,255,255,0.05)',
    tileBorder: 'rgba(255,255,255,0.10)',
    titlePress: o.text,
    btnPress: o.btn,
});

const NEUTRAL_BORDER = 'rgba(255,255,255,0.10)';

const TONES = {
    wav: audioTone(SKY, {
        tint: 0.07, border: rgba(SKY, 0.2), press: 0.4, tile: 0.2, tileBorder: 0.3,
        icon: '#38BDF8', text: '#7DD3FC', btn: '#38BDF8',
    }),
    best: audioTone(EMERALD, {
        tint: 0.08, border: rgba(EMERALD, 0.2), press: 0.4, tile: 0.2, tileBorder: 0.3,
        icon: '#34D399', text: '#6EE7B7', btn: '#34D399',
    }),
    standard: audioTone(TEAL, {
        tint: 0.05, border: NEUTRAL_BORDER, press: 0.3, tile: 0.17, tileBorder: 0.25,
        icon: '#2DD4BF', text: '#5EEAD4', btn: '#2DD4BF',
    }),
    low: audioTone(AMBER, {
        tint: 0.04, border: NEUTRAL_BORDER, press: 0.3, tile: 0.17, tileBorder: 0.25,
        icon: '#FBBF24', text: '#FCD34D', btn: '#FBBF24',
    }),
    uhd4k: videoTone(PURPLE, {
        tint: 0.1, border: rgba(PURPLE, 0.3), press: 0.6,
        icon: '#C084FC', text: '#E9D5FF', btn: '#C084FC',
    }),
    qhd2k: videoTone(INDIGO, {
        tint: 0.08, border: rgba(INDIGO, 0.25), press: 0.5,
        icon: '#818CF8', text: '#E0E7FF', btn: '#818CF8',
    }),
    fhd: videoTone(BLUE, {
        tint: 0.07, border: rgba(BLUE, 0.2), press: 0.5,
        icon: '#60A5FA', text: '#DBEAFE', btn: '#60A5FA',
    }),
    plain: videoTone(WHITE, {
        tint: 0.03, border: NEUTRAL_BORDER, press: 0.25,
        icon: '#22D3EE', text: '#FFFFFF', btn: '#60A5FA',
    }),
};

const PILLS = {
    wav: { bg: rgba(SKY, 0.2), border: rgba(SKY, 0.3), fg: '#7DD3FC' },
    best: { bg: rgba(EMERALD, 0.2), border: rgba(EMERALD, 0.3), fg: '#6EE7B7' },
    standard: { bg: rgba(TEAL, 0.15), border: rgba(TEAL, 0.25), fg: '#5EEAD4' },
    low: { bg: rgba(AMBER, 0.15), border: rgba(AMBER, 0.25), fg: '#FCD34D' },
    uhd4k: { bg: rgba(PURPLE, 0.25), border: rgba(PURPLE, 0.4), fg: '#D8B4FE' },
    qhd2k: { bg: rgba(INDIGO, 0.25), border: rgba(INDIGO, 0.4), fg: '#A5B4FC' },
    fhd: { bg: rgba(BLUE, 0.2), border: rgba(BLUE, 0.3), fg: '#93C5FD' },
    hd: { bg: rgba(CYAN, 0.2), border: rgba(CYAN, 0.3), fg: '#67E8F9' },
    source: { bg: rgba(WHITE, 0.15), border: rgba(WHITE, 0.2), fg: 'rgba(255,255,255,0.9)' },
};

/* ───────────────────────── card ───────────────────────── */

let tintSeq = 0;

/**
 * Left-to-right wash: the row's tint, easing through a whisper of white and out
 * to nothing, like desktop's `from-X via-white/[0.02] to-transparent`.
 */
const CardTint: React.FC<{ id: string; rgb: string; alpha: number }> = ({
    id,
    rgb,
    alpha,
}) => (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
                <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={alpha} />
                    <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.02} />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
    </View>
);

const PillView: React.FC<{ pill: Pill }> = ({ pill }) => (
    <View style={[styles.badge, { backgroundColor: pill.bg, borderColor: pill.border }]}>
        <Text style={[styles.badgeText, { color: pill.fg }]}>{pill.text}</Text>
    </View>
);

interface FormatCardProps {
    title: string;
    subtitle: string;
    tone: Tone;
    /** Pills after the title; order is the order they are drawn. */
    pills?: Pill[];
    icon: 'audio' | 'video';
    onPress: () => void;
    delay: number;
}

const FormatCard: React.FC<FormatCardProps> = ({
    title,
    subtitle,
    tone,
    pills = [],
    icon,
    onPress,
    delay,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(15)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const gradId = useRef(`fmtTint${++tintSeq}`).current;
    const [pressed, setPressed] = useState(false);

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
    }, [delay, fadeAnim, slideAnim]);

    const handlePressIn = () => {
        setPressed(true);
        Animated.spring(scaleAnim, {
            toValue: 0.98,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handlePressOut = () => {
        setPressed(false);
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const baseAlpha = Math.min(tone.tint * TINT_BOOST, 0.3);
    // Desktop hover: bg-X/[0.12] over a 0.07 rest tint.
    const alpha = pressed ? Math.min(baseAlpha * 1.9, 0.32) : baseAlpha;

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            }}
        >
            <TouchableOpacity
                style={[
                    styles.formatCard,
                    { borderColor: pressed ? tone.borderPress : tone.border },
                ]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
            >
                <CardTint id={gradId} rgb={tone.rgb} alpha={alpha} />

                {/* Left icon tile */}
                <View
                    style={[
                        styles.iconContainer,
                        { backgroundColor: tone.tileBg, borderColor: tone.tileBorder },
                    ]}
                >
                    {icon === 'audio' ? (
                        <MusicNoteIcon size={20} color={tone.icon} />
                    ) : (
                        <VideoIcon size={20} color={tone.icon} />
                    )}
                </View>

                {/* Title, pills and subtitle */}
                <View style={styles.formatInfo}>
                    <View style={styles.titleRow}>
                        <Text
                            style={[
                                styles.formatTitle,
                                pressed && { color: tone.titlePress },
                            ]}
                        >
                            {title}
                        </Text>
                        {pills.map(p => (
                            <PillView key={p.text} pill={p} />
                        ))}
                    </View>
                    <Text style={styles.formatSubtitle} numberOfLines={1}>
                        {subtitle}
                    </Text>
                </View>

                {/* Download button: fills with the row's accent while pressed */}
                <View
                    style={[
                        styles.downloadButton,
                        pressed && {
                            backgroundColor: tone.btnPress,
                            borderColor: tone.btnPress,
                        },
                    ]}
                >
                    <DownloadIcon
                        size={16}
                        color={pressed ? '#000000' : 'rgba(255, 255, 255, 0.55)'}
                    />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

/* ───────────────────────── list ───────────────────────── */

const pill = (text: string, p: { bg: string; border: string; fg: string }): Pill => ({
    text,
    ...p,
});

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
                    <MusicNoteIcon size={14} color="#34D399" />
                    <Text style={styles.sectionTitle}>AUDIO ONLY</Text>
                </View>
            </View>

            <FormatCard
                title="Audio (WAV)"
                subtitle="Uncompressed PCM • Full artist, album & year tags • No cover art"
                tone={TONES.wav}
                pills={[pill('UNCOMPRESSED', PILLS.wav)]}
                icon="audio"
                onPress={() => onSelectFormat('audio_wav')}
                delay={animationDelay += 40}
            />

            <FormatCard
                title="Audio (Best Quality)"
                subtitle="~320kbps • Studio Grade High Bitrate MP3"
                tone={TONES.best}
                pills={[pill('320KBPS MP3', PILLS.best)]}
                icon="audio"
                onPress={() => onSelectFormat('audio_best')}
                delay={animationDelay += 40}
            />

            <FormatCard
                title="Audio (Standard)"
                subtitle="~128kbps • Balanced Size & Quality"
                tone={TONES.standard}
                pills={[pill('128KBPS', PILLS.standard)]}
                icon="audio"
                onPress={() => onSelectFormat('audio_standard')}
                delay={animationDelay += 40}
            />

            <FormatCard
                title="Audio (Low)"
                subtitle="~64kbps • Save Data & Storage"
                tone={TONES.low}
                pills={[pill('64KBPS', PILLS.low)]}
                icon="audio"
                onPress={() => onSelectFormat('audio_low')}
                delay={animationDelay += 40}
            />

            {/* Section Header - Video Quality */}
            {videoFormats.length > 0 && (
                <>
                    <View style={[styles.sectionHeaderRow, { marginTop: Spacing.lg }]}>
                        <View style={styles.sectionHeaderLeft}>
                            <VideoIcon size={14} color="#60A5FA" />
                            <Text style={styles.sectionTitle}>VIDEO QUALITY</Text>
                        </View>
                        <Text style={styles.sectionHeaderRight}>{videoFormats.length} OPTIONS</Text>
                    </View>

                    {videoFormats.map((format, index) => {
                        // Quality follows the short side, like YouTube (portrait 1080x1920 = 1080p).
                        const h = qualityHeight(format.width, format.height);
                        const is4K = h >= 2160;
                        const is2K = h >= 1440 && h < 2160;
                        const is1080 = h >= 1080 && h < 1440;
                        const is720 = h >= 720 && h < 1080;

                        let tone = TONES.plain;
                        let tierPill: Pill | undefined;
                        if (is4K) {
                            tone = TONES.uhd4k;
                            tierPill = pill('4K ULTRA HD', PILLS.uhd4k);
                        } else if (is2K) {
                            tone = TONES.qhd2k;
                            tierPill = pill('2K QHD', PILLS.qhd2k);
                        } else if (is1080) {
                            tone = TONES.fhd;
                            tierPill = pill('1080P FHD', PILLS.fhd);
                        } else if (is720) {
                            tierPill = pill('720P HD', PILLS.hd);
                        }

                        const pills: Pill[] = [];
                        // Twitch labels its top rung "Source"; everything else
                        // marks it "Best Quality", then adds the tier pill.
                        if (isTwitch) {
                            if (index === 0) pills.push(pill('SOURCE', PILLS.source));
                            else if (tierPill) pills.push(tierPill);
                        } else {
                            if (index === 0) pills.push(pill('BEST QUALITY', PILLS.source));
                            if (tierPill) pills.push(tierPill);
                        }

                        return (
                            <FormatCard
                                key={`${format.formatId}-${index}`}
                                title={isTwitch ? formatTwitchQuality(format) : qualityLabel(format.width, format.height, format.fps)}
                                subtitle={
                                    isTwitch
                                        ? `${format.ext?.toUpperCase() || 'MP4'}${format.fps ? ` • ${Math.round(format.fps)} fps` : ''}`
                                        : `${format.ext?.toUpperCase() || 'MP4'} • ${format.width && format.height ? `${format.width}×${format.height}` : `${h}p`}`
                                }
                                tone={tone}
                                pills={pills}
                                icon="video"
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
        gap: 8,
    },
    // Desktop: text-white/50 with only the icon coloured.
    sectionTitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.1,
    },
    sectionHeaderRight: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.8,
    },
    // Transparent on purpose: the tint is drawn straight onto the dark page,
    // exactly like desktop, instead of over a lifted grey card.
    formatCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
        paddingVertical: 14,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
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
        borderRadius: 6,
        borderWidth: 1,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.7,
    },
    downloadButton: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
});

export default FormatList;
