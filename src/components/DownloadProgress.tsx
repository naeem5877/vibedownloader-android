/**
 * Premium DownloadProgress - Circular progress with desktop-like UI
 */
import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { CloseIcon } from './Icons';
import { ShinyText } from './ShinyText';

interface DownloadProgressProps {
    progress: number; // 0-100
    eta: number; // seconds
    onCancel: () => void;
    title?: string;
    platformColor?: string;
    statusLine?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const DownloadProgress: React.FC<DownloadProgressProps> = ({
    progress,
    eta,
    onCancel,
    title,
    platformColor = Colors.primary,
    statusLine,
}) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    const shimmerAnim = useRef(new Animated.Value(0)).current;

    // Entry animation
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
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

    // Progress animation - clamp between 0 and 100
    useEffect(() => {
        const clampedProgress = Math.max(0, Math.min(progress, 100));
        Animated.timing(progressAnim, {
            toValue: clampedProgress,
            duration: 300,
            useNativeDriver: false,
            easing: Easing.out(Easing.cubic),
        }).start();
    }, [progress]);

    // Pulse animation
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.02,
                    duration: 1000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        ).start();

        // Glow animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: false,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(glowAnim, {
                    toValue: 0,
                    duration: 1500,
                    useNativeDriver: false,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        ).start();
        // Shimmer effect
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 2000,
                useNativeDriver: true,
                easing: Easing.linear,
            })
        ).start();
    }, []);

    const formatStatus = (): string => {
        // If we have a specific status line from the engine, use it
        if (statusLine) {
            if (statusLine.toLowerCase().includes('merging') || statusLine.toLowerCase().includes('ffmpeg')) {
                return 'Merging tracks...';
            }
            if (statusLine.toLowerCase().includes('embed') || statusLine.toLowerCase().includes('metadata')) {
                return 'Embedding assets...';
            }
            if (statusLine.toLowerCase().includes('saving')) {
                return 'Finalizing file...';
            }
            return statusLine;
        }

        // Default behavior based on ETA and progress
        if (progress >= 99 && eta <= 0) {
            return 'Merging sequences...';
        }

        if (eta <= 0 || progress <= 0) {
            // Randomize "Calculating" messages for industrial feel
            const messages = [
                'System initializing...',
                'Finding sequences...',
                'Exploring assets...',
                'Parsing metadata...',
                'Mapping stream...',
                'Fetching segments...'
            ];
            // Use progress as a pseudo-random seed to keep it stable per stage
            const index = Math.floor((Math.abs(progress) || (title ? title.length : 0)) % messages.length);
            return messages[index];
        }

        if (eta < 60) return `${Math.round(eta)}s remaining`;
        const mins = Math.floor(eta / 60);
        const secs = Math.round(eta % 60);
        return `${mins}m ${secs}s remaining`;
    };

    const glowIntensity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.1, 0.3],
    });

    // Circular progress values
    const size = 100;
    const radius = 42;
    const strokeWidth = 6;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                    borderColor: platformColor,
                }
            ]}
        >
            {/* Content */}
            <View style={styles.content}>
                {/* Circular Progress Ring */}
                <View style={styles.circularProgressContainer}>
                    <Svg width={size} height={size}>
                        <Defs>
                            <LinearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="100%">
                                <Stop offset="0%" stopColor={platformColor} />
                                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.8} />
                                <Stop offset="100%" stopColor={platformColor} />
                            </LinearGradient>
                        </Defs>
                        {/* Background Circle */}
                        <Circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={Colors.border}
                            strokeWidth={strokeWidth}
                            fill="none"
                            opacity={0.3}
                        />
                        {/* Progress Circle */}
                        <AnimatedCircle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={platformColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        />
                        {/* Shiny Overlay */}
                        <AnimatedCircle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke="url(#shimmer)"
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={[15, circumference]}
                            strokeDashoffset={shimmerAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [circumference, -circumference],
                            })}
                            strokeLinecap="round"
                            opacity={0.6}
                            transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        />
                    </Svg>
                    <View style={styles.progressTextContainer}>
                        <Text style={[styles.progressPercent, { color: platformColor }]}>
                            {Math.max(0, Math.round(progress))}%
                        </Text>
                    </View>
                </View>

                {/* Title and Info */}
                <View style={styles.infoContainer}>
                    <ShinyText
                        text={progress >= 99 ? 'PROCESSING...' : 'DOWNLOADING...'}
                        fontSize={Typography.sizes.xxs}
                        color={Colors.textMuted}
                        fontWeight={Typography.weights.bold}
                        letterSpacing={1.5}
                    />
                    <Text style={styles.title} numberOfLines={2}>
                        {title || 'Media file'}
                    </Text>
                    <ShinyText
                        text={formatStatus()}
                        fontSize={Typography.sizes.sm}
                        color={Colors.textSecondary}
                        shineColor="#FFF"
                        fontWeight={Typography.weights.medium}
                        speed={3}
                    />
                </View>

                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onCancel}
                    activeOpacity={0.7}
                >
                    <CloseIcon size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        borderWidth: 2,
        padding: Spacing.xl,
        ...Shadows.xl,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.lg,
    },
    circularProgressContainer: {
        width: 100,
        height: 100,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressTextContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressPercent: {
        fontSize: Typography.sizes['2xl'],
        fontWeight: Typography.weights.black,
        letterSpacing: -1,
    },
    infoContainer: {
        flex: 1,
        gap: Spacing.xs,
    },
    statusText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold,
        letterSpacing: 1.5,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        lineHeight: 20,
    },
    etaText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
    },
    cancelButton: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceHover,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
});

export default DownloadProgress;
