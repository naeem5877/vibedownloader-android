/**
 * Premium SkeletonCard - Animated loading placeholder
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const SkeletonCard = () => {
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        // Shimmer animation
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 1500,
                useNativeDriver: true,
                easing: Easing.linear,
            })
        ).start();

        // Pulse animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.6,
                    duration: 800,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        ).start();
    }, []);

    const translateX = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
    });

    return (
        <View style={styles.container}>
            {/* Thumbnail Skeleton */}
            <View style={styles.thumbnailContainer}>
                <Animated.View style={[styles.thumbnail, { opacity: pulseAnim }]} />

                {/* Shimmer overlay */}
                <Animated.View
                    style={[
                        styles.shimmer,
                        { transform: [{ translateX }] }
                    ]}
                />

                {/* Duration badge skeleton */}
                <Animated.View style={[styles.durationBadge, { opacity: pulseAnim }]} />

                {/* Quality badge skeleton */}
                <Animated.View style={[styles.qualityBadge, { opacity: pulseAnim }]} />
            </View>

            {/* Content Skeleton */}
            <View style={styles.content}>
                {/* Title skeleton */}
                <Animated.View style={[styles.titleLine, { opacity: pulseAnim }]} />
                <Animated.View style={[styles.titleLineShort, { opacity: pulseAnim }]} />

                {/* Meta skeleton */}
                <View style={styles.metaRow}>
                    <Animated.View style={[styles.metaDot, { opacity: pulseAnim }]} />
                    <Animated.View style={[styles.metaText, { opacity: pulseAnim }]} />
                    <Animated.View style={[styles.metaDivider, { opacity: pulseAnim }]} />
                    <Animated.View style={[styles.metaViews, { opacity: pulseAnim }]} />
                </View>

                {/* Stats row skeleton */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Animated.View style={[styles.statValue, { opacity: pulseAnim }]} />
                        <Animated.View style={[styles.statLabel, { opacity: pulseAnim }]} />
                    </View>
                    <View style={styles.statItem}>
                        <Animated.View style={[styles.statValue, { opacity: pulseAnim }]} />
                        <Animated.View style={[styles.statLabel, { opacity: pulseAnim }]} />
                    </View>
                    <View style={styles.statItem}>
                        <Animated.View style={[styles.statValue, { opacity: pulseAnim }]} />
                        <Animated.View style={[styles.statLabel, { opacity: pulseAnim }]} />
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    thumbnailContainer: {
        position: 'relative',
        overflow: 'hidden',
    },
    thumbnail: {
        width: '100%',
        height: 200,
        backgroundColor: Colors.surfaceElevated,
    },
    shimmer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        width: 100,
    },
    durationBadge: {
        position: 'absolute',
        bottom: Spacing.sm,
        right: Spacing.sm,
        width: 50,
        height: 22,
        backgroundColor: Colors.surfaceHover,
        borderRadius: BorderRadius.sm,
    },
    qualityBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        width: 36,
        height: 22,
        backgroundColor: Colors.surfaceHover,
        borderRadius: BorderRadius.sm,
    },
    content: {
        padding: Spacing.md,
    },
    titleLine: {
        height: 20,
        width: '90%',
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.sm,
        marginBottom: Spacing.xs,
    },
    titleLineShort: {
        height: 20,
        width: '60%',
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.sm,
        marginBottom: Spacing.md,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    metaDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.surfaceElevated,
        marginRight: Spacing.sm,
    },
    metaText: {
        height: 14,
        width: 80,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.xs,
    },
    metaDivider: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.surfaceElevated,
        marginHorizontal: Spacing.sm,
    },
    metaViews: {
        height: 14,
        width: 60,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.xs,
    },
    statsRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: Spacing.md,
        gap: Spacing.xl,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        height: 22,
        width: 40,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.xs,
        marginBottom: 4,
    },
    statLabel: {
        height: 10,
        width: 30,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.xs,
    },
});

export default SkeletonCard;
