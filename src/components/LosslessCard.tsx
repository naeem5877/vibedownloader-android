/**
 * LosslessCard - Premium glassmorphic card showing lossless audio availability
 * Features: animated gradient border, glow effects, pulse animation, quality badges
 */
import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    ActivityIndicator,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { DownloadIcon, WaveformIcon, MusicIcon } from './Icons';
import { LosslessAvailability, formatQualityLabel, formatSourceLabel } from '../services/LosslessService';

interface LosslessCardProps {
    availability: LosslessAvailability;
    isLoading: boolean;
    onDownload: () => void;
    title?: string;
    artist?: string;
    platformColor?: string;
}

const LOSSLESS_COLOR = Colors.lossless;
const LOSSLESS_GRADIENT_START = Colors.lossless;
const LOSSLESS_GRADIENT_END = Colors.primary;
const FLAC_BADGE_COLOR = '#FF6B35';

export const LosslessCard: React.FC<LosslessCardProps> = ({
    availability,
    isLoading,
    onDownload,
    title,
    artist,
    platformColor = Colors.primary,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const waveAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entry animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 40,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();

        // Continuous pulse glow
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.02,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();

        // Glow animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
                Animated.timing(glowAnim, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
            ])
        ).start();

        // Shimmer effect
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 3000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // Wave animation for audio bars
        Animated.loop(
            Animated.sequence([
                Animated.timing(waveAnim, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(waveAnim, {
                    toValue: 0,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const glowOpacity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.15, 0.4],
    });

    if (isLoading) {
        return (
            <Animated.View
                style={[
                    styles.container,
                    styles.loadingContainer,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
            >
                <View style={styles.loadingContent}>
                    <ActivityIndicator size="small" color={LOSSLESS_COLOR} />
                    <Text style={styles.loadingText}>Checking lossless availability...</Text>
                </View>
            </Animated.View>
        );
    }

    if (!availability.available) {
        return null;
    }

    const qualityLabel = formatQualityLabel(availability.bitDepth, availability.sampleRate);
    const sourceLabel = formatSourceLabel(availability.source);

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }, { scale: pulseAnim }],
                },
            ]}
        >
            {/* Animated Glow Background */}
            <Animated.View
                style={[
                    styles.glowLayer,
                    { opacity: glowOpacity },
                ]}
            />

            {/* Gradient Border Effect */}
            <View style={styles.gradientBorderContainer}>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                    <Defs>
                        <LinearGradient id="losslessGrad" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor={LOSSLESS_GRADIENT_START} stopOpacity="0.6" />
                            <Stop offset="0.5" stopColor={LOSSLESS_GRADIENT_END} stopOpacity="0.3" />
                            <Stop offset="1" stopColor={LOSSLESS_GRADIENT_START} stopOpacity="0.6" />
                        </LinearGradient>
                    </Defs>
                    <Rect
                        x="0" y="0" width="100%" height="100%"
                        rx={20} ry={20}
                        fill="none"
                        stroke="url(#losslessGrad)"
                        strokeWidth="2"
                    />
                </Svg>
            </View>

            {/* Card Content */}
            <View style={styles.cardContent}>
                {/* Top Section: Badge + Quality Info */}
                <View style={styles.topSection}>
                    <View style={styles.leftSection}>
                        {/* FLAC Badge */}
                        <View style={styles.flacBadge}>
                            <Text style={styles.flacBadgeText}>FLAC</Text>
                        </View>

                        {/* Lossless Label */}
                        <View style={styles.labelContainer}>
                            <Text style={styles.losslessTitle}>Lossless Audio</Text>
                            <Text style={styles.qualityLabel}>{qualityLabel}</Text>
                        </View>
                    </View>

                    {/* Audio Waveform Animation */}
                    <View style={styles.waveformContainer}>
                        {[0.6, 1, 0.7, 0.9, 0.5, 0.8, 0.4].map((height, i) => (
                            <Animated.View
                                key={i}
                                style={[
                                    styles.waveBar,
                                    {
                                        height: 4 + height * 20,
                                        backgroundColor: LOSSLESS_COLOR,
                                        opacity: 0.3 + height * 0.7,
                                        transform: [{
                                            scaleY: waveAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [
                                                    0.5 + (i % 2 === 0 ? 0.3 : 0),
                                                    0.7 + (i % 2 === 0 ? 0 : 0.3),
                                                ],
                                            }),
                                        }],
                                    },
                                ]}
                            />
                        ))}
                    </View>
                </View>

                {/* Source & Meta Info */}
                <View style={styles.metaRow}>
                    <View style={styles.sourceBadge}>
                        <View style={[styles.sourceDot, { backgroundColor: LOSSLESS_COLOR }]} />
                        <Text style={styles.sourceText}>via {sourceLabel}</Text>
                    </View>

                    {availability.codec && (
                        <View style={styles.codecBadge}>
                            <Text style={styles.codecText}>{availability.codec}</Text>
                        </View>
                    )}

                    {availability.bitDepth && availability.sampleRate && (
                        <View style={styles.codecBadge}>
                            <Text style={styles.codecText}>
                                {availability.bitDepth}bit/{(availability.sampleRate / 1000).toFixed(1)}kHz
                            </Text>
                        </View>
                    )}
                </View>

                {/* Download Button */}
                <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={onDownload}
                    activeOpacity={0.8}
                >
                    <View style={styles.downloadButtonGlow} />
                    <DownloadIcon size={18} color="#FFF" />
                    <Text style={styles.downloadButtonText}>Download Lossless FLAC</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        borderRadius: 28,
        backgroundColor: '#050505',
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 170, 0.2)',
        ...Shadows.xl,
        shadowColor: '#00D4AA',
    },
    loadingContainer: {
        padding: Spacing.xl,
    },
    loadingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    loadingText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold as any,
    },
    glowLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: LOSSLESS_COLOR,
        borderRadius: 28,
    },
    gradientBorderContainer: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28,
    },
    cardContent: {
        padding: Spacing.lg,
        zIndex: 1,
    },
    topSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.lg,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        flex: 1,
    },
    flacBadge: {
        backgroundColor: '#00D4AA',
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 50,
        ...Shadows.md,
        shadowColor: '#00D4AA',
    },
    flacBadgeText: {
        color: '#000',
        fontSize: 10,
        fontWeight: '900' as any,
        letterSpacing: 1,
    },
    labelContainer: {
        flex: 1,
    },
    losslessTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '900' as any,
        letterSpacing: -0.8,
    },
    qualityLabel: {
        color: '#00D4AA',
        fontSize: 11,
        fontWeight: '800' as any,
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 2,
    },
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        height: 36,
        paddingRight: 4,
    },
    waveBar: {
        width: 4,
        borderRadius: 2,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.xl,
        flexWrap: 'wrap',
    },
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    sourceDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    sourceText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '700' as any,
        opacity: 0.9,
    },
    codecBadge: {
        backgroundColor: 'rgba(0, 212, 170, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 170, 0.2)',
    },
    codecText: {
        color: '#00D4AA',
        fontSize: 10,
        fontWeight: '800' as any,
        letterSpacing: 0.5,
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
        paddingVertical: 18,
        borderRadius: 20,
        gap: Spacing.md,
        position: 'relative',
        overflow: 'hidden',
        ...Shadows.xl,
    },
    downloadButtonGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 212, 170, 0.15)',
        borderRadius: 20,
    },
    downloadButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900' as any,
        letterSpacing: 0.5,
    },
});

export default LosslessCard;
