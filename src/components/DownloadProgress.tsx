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
import Svg, { Circle } from 'react-native-svg';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { CloseIcon } from './Icons';

interface DownloadProgressProps {
    progress: number; // 0-100
    eta: number; // seconds
    onCancel: () => void;
    title?: string;
    platformColor?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const DownloadProgress: React.FC<DownloadProgressProps> = ({
    progress,
    eta,
    onCancel,
    title,
    platformColor = Colors.primary,
}) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

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
    }, []);

    const formatEta = (seconds: number): string => {
        if (seconds <= 0) return 'Calculating...';
        if (seconds < 60) return `${Math.round(seconds)}s remaining`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
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
                    </Svg>
                    <View style={styles.progressTextContainer}>
                        <Text style={[styles.progressPercent, { color: platformColor }]}>
                            {Math.max(0, Math.round(progress))}%
                        </Text>
                    </View>
                </View>

                {/* Title and Info */}
                <View style={styles.infoContainer}>
                    <Text style={styles.statusText}>DOWNLOADING...</Text>
                    <Text style={styles.title} numberOfLines={2}>
                        {title || 'Media file'}
                    </Text>
                    <Text style={styles.etaText}>{formatEta(eta)}</Text>
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
        fontWeight: Typography.weights.extrabold,
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
