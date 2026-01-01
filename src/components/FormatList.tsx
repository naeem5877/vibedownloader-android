/**
 * FormatList - Display available download formats/quality options
 */
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { VideoFormat } from '../native/YtDlpModule';
import { formatFileSize } from '../native/YtDlpModule';
import { DownloadIcon } from './Icons';

interface FormatListProps {
    formats: VideoFormat[];
    onSelectFormat: (format: VideoFormat) => void;
    selectedFormatId?: string;
}

export const FormatList: React.FC<FormatListProps> = ({
    formats,
    onSelectFormat,
    selectedFormatId,
}) => {
    // Filter and sort formats - prefer video+audio combined, then by height
    const videoFormats = formats
        .filter(f => f.hasVideo && f.height > 0)
        .sort((a, b) => b.height - a.height);

    const audioFormats = formats
        .filter(f => f.hasAudio && !f.hasVideo)
        .sort((a, b) => (b.tbr || 0) - (a.tbr || 0));

    const getQualityLabel = (format: VideoFormat): string => {
        if (format.height >= 2160) return '4K';
        if (format.height >= 1440) return '2K';
        return '';
    };

    const isBest = (format: VideoFormat, index: number): boolean => {
        return index === 0;
    };

    return (
        <View style={styles.container}>
            {/* Video Quality Section */}
            {videoFormats.length > 0 && (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionIcon}>
                            <Text style={styles.sectionIconText}>□</Text>
                        </View>
                        <Text style={styles.sectionTitle}>Video Quality</Text>
                    </View>

                    {videoFormats.map((format, index) => {
                        const qualityLabel = getQualityLabel(format);
                        const best = isBest(format, index);

                        return (
                            <TouchableOpacity
                                key={format.formatId}
                                style={[
                                    styles.formatItem,
                                    selectedFormatId === format.formatId && styles.formatItemSelected,
                                ]}
                                onPress={() => onSelectFormat(format)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.formatIcon}>
                                    <Text style={styles.formatIconText}>□</Text>
                                </View>

                                <View style={styles.formatInfo}>
                                    <View style={styles.formatTitleRow}>
                                        <Text style={styles.formatTitle}>{format.height}p</Text>
                                        {best && (
                                            <View style={styles.bestBadge}>
                                                <Text style={styles.bestBadgeText}>Best</Text>
                                            </View>
                                        )}
                                        {qualityLabel && (
                                            <View style={[styles.qualityBadge, qualityLabel === '4K' && styles.qualityBadge4K]}>
                                                <Text style={styles.qualityBadgeText}>{qualityLabel}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.formatMeta}>
                                        {format.ext.toUpperCase()} • {format.fps > 0 ? `${Math.round(format.fps)}fps` : format.resolution}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    style={styles.downloadButton}
                                    onPress={() => onSelectFormat(format)}
                                    activeOpacity={0.7}
                                >
                                    <DownloadIcon size={20} color={Colors.textSecondary} />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* Audio Only Section */}
            {audioFormats.length > 0 && (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionIcon}>
                            <Text style={styles.sectionIconText}>♪</Text>
                        </View>
                        <Text style={styles.sectionTitle}>Audio Only</Text>
                    </View>

                    {audioFormats.slice(0, 3).map((format, index) => (
                        <TouchableOpacity
                            key={format.formatId}
                            style={[
                                styles.formatItem,
                                selectedFormatId === format.formatId && styles.formatItemSelected,
                            ]}
                            onPress={() => onSelectFormat(format)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.formatIcon}>
                                <Text style={styles.formatIconText}>♪</Text>
                            </View>

                            <View style={styles.formatInfo}>
                                <Text style={styles.formatTitle}>
                                    {format.ext.toUpperCase()}
                                </Text>
                                <Text style={styles.formatMeta}>
                                    {format.tbr ? `${Math.round(format.tbr)} kbps` : 'Audio'} • {formatFileSize(format.filesize)}
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={styles.downloadButton}
                                onPress={() => onSelectFormat(format)}
                                activeOpacity={0.7}
                            >
                                <DownloadIcon size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.lg,
    },
    section: {
        marginBottom: Spacing.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        paddingHorizontal: Spacing.sm,
    },
    sectionIcon: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.sm,
    },
    sectionIconText: {
        color: Colors.textSecondary,
        fontSize: 14,
    },
    sectionTitle: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    formatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        ...Shadows.sm,
    },
    formatItemSelected: {
        borderColor: Colors.primary,
    },
    formatIcon: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.info,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    formatIconText: {
        color: Colors.textPrimary,
        fontSize: 16,
        fontWeight: Typography.weights.bold,
    },
    formatInfo: {
        flex: 1,
    },
    formatTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    formatTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.semibold,
    },
    bestBadge: {
        backgroundColor: Colors.success,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    bestBadgeText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.medium,
    },
    qualityBadge: {
        backgroundColor: Colors.info,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    qualityBadge4K: {
        backgroundColor: '#9333ea',
    },
    qualityBadgeText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
    },
    formatMeta: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        marginTop: 2,
    },
    downloadButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: BorderRadius.md,
    },
});

export default FormatList;
