/**
 * BatchDownloadProgress - Shows progress for playlist/batch downloads
 * Displays overall progress + individual track statuses
 */
import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    FlatList,
    ScrollView,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { CloseIcon, CheckIcon, MusicIcon } from './Icons';
import { ShinyText } from './ShinyText';

export interface BatchDownloadItem {
    id: string;
    title: string;
    artist?: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed';
    progress?: number;
    error?: string;
}

interface BatchDownloadProgressProps {
    items: BatchDownloadItem[];
    totalItems: number;
    completedCount: number;
    failedCount: number;
    currentTitle?: string;
    onCancel: () => void;
    onClose: () => void;
    platformColor?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const BatchDownloadProgress: React.FC<BatchDownloadProgressProps> = ({
    items,
    totalItems,
    completedCount,
    failedCount,
    currentTitle,
    onCancel,
    onClose,
    platformColor = Colors.primary,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    const overallProgress = totalItems > 0 ? ((completedCount + failedCount) / totalItems) * 100 : 0;
    const isComplete = completedCount + failedCount >= totalItems && totalItems > 0;

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

        // Pulse when downloading
        if (!isComplete) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.01,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [isComplete]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: overallProgress,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [overallProgress]);

    // Circular progress
    const size = 80;
    const radius = 34;
    const strokeWidth = 5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
    });

    const getStatusIcon = (status: BatchDownloadItem['status']) => {
        switch (status) {
            case 'completed':
                return <CheckIcon size={12} color={Colors.success} />;
            case 'failed':
                return <Text style={styles.failedIcon}>✗</Text>;
            case 'downloading':
                return <View style={[styles.downloadingDot, { backgroundColor: platformColor }]} />;
            default:
                return <View style={styles.queuedDot} />;
        }
    };

    const getStatusColor = (status: BatchDownloadItem['status']) => {
        switch (status) {
            case 'completed': return Colors.success;
            case 'failed': return Colors.error;
            case 'downloading': return platformColor;
            default: return Colors.textMuted;
        }
    };

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }, { scale: pulseAnim }],
                    borderColor: isComplete ? Colors.success : platformColor,
                },
            ]}
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {/* Circular Progress */}
                    <View style={styles.circularContainer}>
                        <Svg width={size} height={size}>
                            <Defs>
                                <LinearGradient id="batchShimmer" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <Stop offset="0%" stopColor={isComplete ? Colors.success : platformColor} />
                                    <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.8} />
                                    <Stop offset="100%" stopColor={isComplete ? Colors.success : platformColor} />
                                </LinearGradient>
                            </Defs>
                            <Circle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                stroke={Colors.border}
                                strokeWidth={strokeWidth}
                                fill="none"
                                opacity={0.3}
                            />
                            <AnimatedCircle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                stroke={isComplete ? Colors.success : platformColor}
                                strokeWidth={strokeWidth}
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                            />
                            {/* Shiny Overlay */}
                            {!isComplete && (
                                <AnimatedCircle
                                    cx={size / 2}
                                    cy={size / 2}
                                    r={radius}
                                    stroke="url(#batchShimmer)"
                                    strokeWidth={strokeWidth}
                                    fill="none"
                                    strokeDasharray={[12, circumference]}
                                    strokeDashoffset={shimmerAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [circumference, -circumference],
                                    })}
                                    strokeLinecap="round"
                                    opacity={0.6}
                                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                />
                            )}
                        </Svg>
                        <View style={styles.progressTextContainer}>
                            <Text style={[styles.progressPercent, { color: isComplete ? Colors.success : platformColor }]}>
                                {completedCount}/{totalItems}
                            </Text>
                        </View>
                    </View>

                    {/* Info */}
                    <View style={styles.headerInfo}>
                        <ShinyText
                            text={isComplete ? '✓ BATCH COMPLETE' : 'DOWNLOADING PLAYLIST...'}
                            fontSize={Typography.sizes.xxs}
                            color={isComplete ? Colors.success : Colors.textMuted}
                            shineColor="#FFF"
                            fontWeight={Typography.weights.bold}
                            letterSpacing={1.5}
                        />
                        <Text style={styles.currentTitle} numberOfLines={1}>
                            {isComplete
                                ? `${completedCount} downloaded${failedCount > 0 ? `, ${failedCount} failed` : ''}`
                                : currentTitle || 'Preparing...'
                            }
                        </Text>
                        <Text style={styles.statsText}>
                            {completedCount} completed • {failedCount} failed • {totalItems - completedCount - failedCount} remaining
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={isComplete ? onClose : onCancel}
                    activeOpacity={0.7}
                >
                    <CloseIcon size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Track List (compact) */}
            {items.length > 0 && (
                <View style={styles.trackList}>
                    <ScrollView
                        style={styles.trackScroll}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {items.slice(-8).map((item) => (
                            <View key={item.id} style={styles.trackRow}>
                                {getStatusIcon(item.status)}
                                <Text
                                    style={[
                                        styles.trackTitle,
                                        { color: getStatusColor(item.status) },
                                        item.status === 'queued' && { opacity: 0.5 },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {item.title}
                                </Text>
                                {item.artist && (
                                    <Text style={styles.trackArtist} numberOfLines={1}>
                                        {item.artist}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        borderWidth: 2,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        flex: 1,
    },
    circularContainer: {
        width: 80,
        height: 80,
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
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.black,
        letterSpacing: -0.5,
    },
    headerInfo: {
        flex: 1,
        gap: 3,
    },
    statusLabel: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.bold as any,
        letterSpacing: 1.5,
    },
    currentTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold as any,
    },
    statsText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.medium as any,
    },
    closeButton: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceHover,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    trackList: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        maxHeight: 200,
    },
    trackScroll: {
        maxHeight: 180,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        gap: Spacing.sm,
    },
    trackTitle: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.medium as any,
        flex: 1,
    },
    trackArtist: {
        fontSize: Typography.sizes.xxs,
        color: Colors.textMuted,
        maxWidth: 80,
    },
    downloadingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    queuedDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.textMuted,
        opacity: 0.4,
    },
    failedIcon: {
        color: Colors.error,
        fontSize: 12,
        fontWeight: '700' as any,
    },
});

export default BatchDownloadProgress;
