/**
 * DownloadProgress - the desktop download overlay, for the phone.
 *
 * Desktop darkens the thumbnail (bg-black/85), shows a CircularProgress ring and
 * a four-step "DownloadActivity" timeline (Preparing, Downloading, Processing,
 * Finishing up) with live detail under the active step and an elapsed timer.
 * This is the same thing: the thumbnail dimmed behind a ring + timeline, fed
 * by the speed / size / stage details the native module now reports.
 */
import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../theme';
import { CloseIcon } from './Icons';

interface DownloadProgressProps {
    progress: number; // 0-100
    eta: number; // seconds
    onCancel: () => void;
    title?: string;
    platformColor?: string;
    /** Friendly line from the native module ("Finalizing...", "Cutting segment...") */
    statusLine?: string;
    /** Thumbnail shown dimmed behind the overlay, like desktop. */
    thumbnail?: string | null;
    /** Transfer rate, e.g. `2.34MiB/s` */
    speed?: string;
    /** Stream size, e.g. `120.50MiB` */
    size?: string;
    /** Untouched yt-dlp line; carries stage tags like [Merger]. */
    rawLine?: string;
}

type StepState = 'done' | 'active' | 'pending';

/* ───────────────────────── helpers ───────────────────────── */

const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const formatEta = (secs: number) => {
    if (!secs || secs <= 0) return '';
    const s = Math.round(secs);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Time since mount, ticking twice a second.
function useElapsed(): number {
    const [ms, setMs] = useState(0);
    useEffect(() => {
        const start = Date.now();
        const id = setInterval(() => setMs(Date.now() - start), 500);
        return () => clearInterval(id);
    }, []);
    return ms;
}

// yt-dlp names every post-processor in square brackets, so the real job being
// run can be reported instead of a generic "Processing...".
const PROCESSING_NAMES: [RegExp, string][] = [
    [/\[Merger\]/i, 'Merging video and audio'],
    [/\[(VideoConvertor)\]/i, 'Converting format'],
    [/\[VideoRemuxer\]/i, 'Remuxing container'],
    [/\[(FFmpeg)?ExtractAudio\]/i, 'Extracting audio'],
    [/\[Fixup\w*\]/i, 'Fixing container'],
    [/\[(ModifyChapters|SponsorBlock)\]/i, 'Editing chapters'],
];
const FINISHING_NAMES: [RegExp, string][] = [
    [/\[EmbedThumbnail\]/i, 'Embedding cover art'],
    [/\[ThumbnailsConvertor\]/i, 'Preparing cover art'],
    [/\[(FFmpeg)?Metadata\]/i, 'Writing metadata'],
    [/\[MoveFiles\]/i, 'Saving file'],
];
const PROCESSING_WORDS = /merg|convert|extract|cutting|remux|encod|processing|finaliz/i;
const FINISHING_WORDS = /saving|metadata|embed|cover art|album art/i;

interface Activity {
    /** 0 Preparing, 1 Downloading, 2 Processing, 3 Finishing up */
    phase: number;
    /** What the app is doing right now, in words. '' while plain downloading. */
    text: string;
}

function deriveActivity(
    progress: number,
    line: string | undefined,
    rawLine: string | undefined,
    speed: string | undefined,
): Activity {
    const raw = rawLine || '';
    const friendly = (line || '').trim();

    for (const [re, label] of FINISHING_NAMES) {
        if (re.test(raw)) return { phase: 3, text: label };
    }
    for (const [re, label] of PROCESSING_NAMES) {
        if (re.test(raw)) return { phase: 2, text: label };
    }

    const isDownloadingLine = /^\d+%\s*-\s*downloading/i.test(friendly);
    const clean = friendly.replace(/\.{2,}$|…$/, '');

    if (!isDownloadingLine && FINISHING_WORDS.test(friendly)) {
        return { phase: 3, text: clean };
    }
    if (!isDownloadingLine && PROCESSING_WORDS.test(friendly)) {
        return { phase: 2, text: clean };
    }
    if (progress > 0 || speed) {
        return { phase: 1, text: '' };
    }
    return { phase: 0, text: clean };
}

/* ───────────────────────── ring ───────────────────────── */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 112;
const STROKE = 5;
const R = RING / 2 - STROKE / 2 - 3.5; // matches desktop's 42.5 radius
const CIRC = 2 * Math.PI * R;

const CircularProgress: React.FC<{
    percent: number;
    color: string;
    processing: boolean;
}> = ({ percent, color, processing }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const spin = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.max(0, Math.min(percent, 100)),
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [percent, anim]);

    // Transcoding and merging report no percentage of their own, so an arc that
    // keeps the download's last number would claim a measurement nobody made.
    // It sweeps instead.
    useEffect(() => {
        if (!processing) return;
        spin.setValue(0);
        const loop = Animated.loop(
            Animated.timing(spin, {
                toValue: 1,
                duration: 1150,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        );
        loop.start();
        return () => loop.stop();
    }, [processing, spin]);

    const offset = anim.interpolate({
        inputRange: [0, 100],
        outputRange: [CIRC, 0],
    });
    const rotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    const c = RING / 2;

    return (
        <View style={styles.ring}>
            <Svg width={RING} height={RING}>
                <Circle
                    cx={c}
                    cy={c}
                    r={R}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={STROKE}
                    fill="transparent"
                />
                {!processing && (
                    <AnimatedCircle
                        cx={c}
                        cy={c}
                        r={R}
                        stroke={color}
                        strokeWidth={STROKE}
                        fill="transparent"
                        strokeDasharray={CIRC}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${c} ${c})`}
                    />
                )}
            </Svg>

            {processing && (
                <Animated.View
                    style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
                >
                    <Svg width={RING} height={RING}>
                        <Circle
                            cx={c}
                            cy={c}
                            r={R}
                            stroke={color}
                            strokeWidth={STROKE}
                            fill="transparent"
                            strokeDasharray={`${CIRC * 0.2} ${CIRC}`}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${c} ${c})`}
                        />
                    </Svg>
                </Animated.View>
            )}

            <View style={styles.ringCenter} pointerEvents="none">
                {processing ? (
                    <>
                        <ActivityIndicator size="small" color={color} />
                        <Text style={styles.ringPercentSmall}>
                            {Math.round(percent)}%
                        </Text>
                    </>
                ) : (
                    <Text style={styles.ringPercent}>{Math.round(percent)}%</Text>
                )}
            </View>
        </View>
    );
};

/* ───────────────────────── timeline ───────────────────────── */

const StepIcon: React.FC<{ state: StepState; color: string }> = ({
    state,
    color,
}) => {
    if (state === 'done') {
        return (
            <View style={styles.iconDone}>
                <Text style={styles.check}>✓</Text>
            </View>
        );
    }
    if (state === 'active') {
        return (
            <View style={styles.iconSlot}>
                <ActivityIndicator size="small" color={color} />
            </View>
        );
    }
    return <View style={styles.iconPending} />;
};

interface Step {
    title: string;
    detail?: string;
    state: StepState;
}

const StepList: React.FC<{ steps: Step[]; color: string }> = ({
    steps,
    color,
}) => (
    <View>
        {steps.map((s, i) => (
            <View
                key={s.title}
                style={[styles.stepRow, i === steps.length - 1 && { paddingBottom: 0 }]}
            >
                {i < steps.length - 1 && (
                    <View
                        style={[
                            styles.connector,
                            {
                                backgroundColor:
                                    s.state === 'done'
                                        ? 'rgba(255,255,255,0.4)'
                                        : 'rgba(255,255,255,0.1)',
                            },
                        ]}
                    />
                )}
                <StepIcon state={s.state} color={color} />
                <View style={styles.stepBody}>
                    <Text
                        style={[
                            styles.stepTitle,
                            {
                                color:
                                    s.state === 'pending'
                                        ? 'rgba(255,255,255,0.3)'
                                        : '#fff',
                            },
                        ]}
                    >
                        {s.title}
                    </Text>
                    {!!s.detail && (
                        <Text
                            style={[
                                styles.stepDetail,
                                {
                                    color:
                                        s.state === 'active'
                                            ? 'rgba(255,255,255,0.65)'
                                            : 'rgba(255,255,255,0.35)',
                                },
                            ]}
                            numberOfLines={2}
                        >
                            {s.detail}
                        </Text>
                    )}
                </View>
            </View>
        ))}
    </View>
);

/* ───────────────────────── main ───────────────────────── */

export const DownloadProgress: React.FC<DownloadProgressProps> = ({
    progress,
    eta,
    onCancel,
    title,
    platformColor = Colors.primary,
    statusLine,
    thumbnail,
    speed,
    size,
    rawLine,
}) => {
    const elapsed = useElapsed();

    const fade = useRef(new Animated.Value(0)).current;
    const rise = useRef(new Animated.Value(16)).current;
    const flash = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(rise, {
                toValue: 0,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            // Desktop: platform-coloured border flashes once as the overlay lands.
            Animated.sequence([
                Animated.delay(250),
                Animated.timing(flash, { toValue: 0.9, duration: 450, useNativeDriver: true }),
                Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }),
            ]),
        ]).start();
    }, [fade, rise, flash]);

    const activity = deriveActivity(progress, statusLine, rawLine, speed);

    // A step never un-completes: a late percentage must not drag the timeline back.
    const furthest = useRef(0);
    const labels = useRef<Record<number, string>>({});
    furthest.current = Math.max(furthest.current, activity.phase);
    const current = furthest.current;
    if (activity.text && activity.phase === current) {
        labels.current[current] = activity.text;
    }

    const transfer = [
        progress > 0 ? `${Math.round(progress)}%` : '',
        speed || '',
        eta > 0 ? `${formatEta(eta)} left` : '',
        size ? `of ${size}` : '',
    ]
        .filter(Boolean)
        .join(' · ');

    const stateOf = (i: number): StepState =>
        i < current ? 'done' : i === current ? 'active' : 'pending';

    const steps: Step[] = [
        {
            title: 'Preparing',
            detail:
                current === 0
                    ? activity.text || 'Getting things ready'
                    : 'Ready',
        },
        {
            title: 'Downloading',
            detail:
                current === 1
                    ? transfer || 'Starting'
                    : current > 1
                      ? 'Downloaded'
                      : '',
        },
        {
            title: 'Processing',
            detail:
                current === 2
                    ? activity.text
                    : current > 2
                      ? labels.current[2] || 'Not needed'
                      : '',
        },
        {
            title: 'Finishing up',
            detail: current === 3 ? activity.text : '',
        },
    ].map((s, i) => ({ ...s, state: stateOf(i) }));

    return (
        <Animated.View
            style={[styles.container, { opacity: fade, transform: [{ translateY: rise }] }]}
        >
            {!!thumbnail && (
                <Image
                    source={{ uri: thumbnail }}
                    style={styles.bgImage}
                    resizeMode="cover"
                    blurRadius={6}
                />
            )}
            <View style={styles.dim} />

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.flash,
                    { borderColor: platformColor, opacity: flash },
                ]}
            />

            <View style={styles.content}>
                <CircularProgress
                    percent={progress}
                    color={platformColor}
                    processing={current >= 2}
                />

                <View style={styles.activity} accessibilityLiveRegion="polite">
                    <View style={styles.headRow}>
                        <Text style={styles.headText}>
                            STEP {current + 1} OF {steps.length}
                        </Text>
                        <Text style={styles.headTime}>{formatElapsed(elapsed)}</Text>
                    </View>
                    <StepList steps={steps} color={platformColor} />
                </View>
            </View>

            {!!title && (
                <Text style={styles.title} numberOfLines={1}>
                    {title}
                </Text>
            )}

            <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
                activeOpacity={0.7}
                accessibilityLabel="Cancel download"
            >
                <CloseIcon size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#000',
        padding: 24,
    },
    // bg-black/85 over the thumbnail, like desktop
    // Fixed height, top-anchored: the card grows/shrinks with its text but the
    // image scale never changes (container clips it via overflow: hidden).
    bgImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 640,
    },
    dim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    flash: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 20,
        borderWidth: 2,
    },
    content: {
        alignItems: 'center',
        gap: 24,
    },
    ring: {
        width: RING,
        height: RING,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    ringPercent: {
        fontSize: 26,
        fontWeight: '800',
        color: '#fff',
        fontVariant: ['tabular-nums'],
    },
    ringPercentSmall: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
        fontVariant: ['tabular-nums'],
    },
    activity: { width: '100%', maxWidth: 340 },
    headRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.6,
        color: 'rgba(255,255,255,0.4)',
    },
    headTime: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.4)',
        fontVariant: ['tabular-nums'],
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingBottom: 14,
    },
    connector: {
        position: 'absolute',
        left: 8.5,
        top: 22,
        bottom: 0,
        width: 1,
    },
    stepBody: { flex: 1, minWidth: 0 },
    stepTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
    stepDetail: {
        marginTop: 2,
        fontSize: 11,
        lineHeight: 15,
        fontVariant: ['tabular-nums'],
    },
    iconSlot: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconDone: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    check: { fontSize: 11, fontWeight: '900', color: '#000', marginTop: -1 },
    iconPending: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    title: {
        marginTop: 20,
        textAlign: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.45)',
    },
    cancelButton: {
        alignSelf: 'center',
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cancelText: {
        fontSize: 13,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.7)',
    },
});

export default DownloadProgress;
