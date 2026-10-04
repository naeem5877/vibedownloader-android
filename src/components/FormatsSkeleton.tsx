import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';
import { SpinnerIcon, SparkleIcon } from './Icons';

export const FormatsSkeleton: React.FC = () => {
    const pulseAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.65,
                    duration: 750,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.3,
                    duration: 750,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        );
        pulse.start();

        return () => pulse.stop();
    }, [pulseAnim]);

    return (
        <View style={styles.container}>
            {/* Analyzing Status Pill */}
            <View style={styles.statusPill}>
                <SpinnerIcon size={14} color={Colors.primary} />
                <Text style={styles.statusText}>Analyzing available formats…</Text>
            </View>

            {/* Quick Download Button Skeleton */}
            <View style={styles.quickActionPlaceholder}>
                <Animated.View style={[styles.quickButtonSkeleton, { opacity: pulseAnim }]} />
            </View>

            {/* Header Skeleton */}
            <View style={styles.headerRow}>
                <Animated.View style={[styles.headerIconSkeleton, { opacity: pulseAnim }]} />
                <Animated.View style={[styles.headerTextSkeleton, { opacity: pulseAnim }]} />
            </View>

            {/* Format Card Placeholders */}
            {[1, 2, 3, 4].map((key) => (
                <View key={key} style={styles.formatCardSkeleton}>
                    {/* Badge */}
                    <Animated.View style={[styles.badgeSkeleton, { opacity: pulseAnim }]} />

                    {/* Format info lines */}
                    <View style={styles.infoSkeleton}>
                        <Animated.View style={[styles.infoLineTitle, { opacity: pulseAnim }]} />
                        <Animated.View style={[styles.infoLineSub, { opacity: pulseAnim }]} />
                    </View>

                    {/* Action button */}
                    <Animated.View style={[styles.actionBtnSkeleton, { opacity: pulseAnim }]} />
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        gap: Spacing.md,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: 10,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    statusText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    quickActionPlaceholder: {
        width: '100%',
    },
    quickButtonSkeleton: {
        width: '100%',
        height: 50,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    headerIconSkeleton: {
        width: 18,
        height: 18,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surface,
    },
    headerTextSkeleton: {
        width: 100,
        height: 14,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surface,
    },
    formatCardSkeleton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: Spacing.md,
    },
    badgeSkeleton: {
        width: 60,
        height: 28,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    infoSkeleton: {
        flex: 1,
        gap: 6,
    },
    infoLineTitle: {
        width: '70%',
        height: 14,
        borderRadius: BorderRadius.xs,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    infoLineSub: {
        width: '45%',
        height: 11,
        borderRadius: BorderRadius.xs,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    actionBtnSkeleton: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.round,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
});

export default FormatsSkeleton;
