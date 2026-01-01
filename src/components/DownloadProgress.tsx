/**
 * DownloadProgress - Progress indicator during downloads
 */
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { CloseIcon } from './Icons';

interface DownloadProgressProps {
    progress: number; // 0-100
    eta: number; // seconds
    onCancel: () => void;
    title?: string;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({
    progress,
    eta,
    onCancel,
    title,
}) => {
    const formatEta = (seconds: number): string => {
        if (seconds <= 0) return 'Calculating...';
        if (seconds < 60) return `${Math.round(seconds)}s remaining`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s remaining`;
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                        {title || 'Downloading...'}
                    </Text>
                    <Text style={styles.eta}>{formatEta(eta)}</Text>
                </View>

                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onCancel}
                    activeOpacity={0.7}
                >
                    <CloseIcon size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                    <View
                        style={[
                            styles.progressFill,
                            { width: `${Math.min(progress, 100)}%` },
                        ]}
                    />
                </View>

                <Text style={styles.progressText}>
                    {Math.round(progress)}%
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        ...Shadows.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    titleContainer: {
        flex: 1,
        marginRight: Spacing.md,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        marginBottom: 4,
    },
    eta: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },
    cancelButton: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceHover,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    progressTrack: {
        flex: 1,
        height: 8,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 4,
    },
    progressText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        minWidth: 40,
        textAlign: 'right',
    },
});

export default DownloadProgress;
