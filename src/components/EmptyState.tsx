import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, Text } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { FolderIcon } from './Icons';

interface EmptyStateProps {
    title?: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title = "No Content",
    message = "There is nothing here yet.",
    actionLabel,
    onAction,
    icon
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.95)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic)
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true
            })
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }]
                },
            ]}
        >
            <View style={styles.iconContainer}>
                {icon || <FolderIcon size={48} color={Colors.textMuted} />}
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            {actionLabel && onAction && (
                <TouchableOpacity
                    onPress={onAction}
                    activeOpacity={0.8}
                    style={styles.button}
                >
                    <Text style={styles.buttonText}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        minHeight: 300,
    },
    iconContainer: {
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        // Optional subtle shadow/glow
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 2,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: Spacing.lg,
        lineHeight: 20,
        maxWidth: 280,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
    },
    buttonText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
    },
});
