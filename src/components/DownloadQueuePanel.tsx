import React, { useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    FlatList,
    Modal,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';
import { QueueItem, QueueItemStatus } from '../hooks/useDownloadQueue';
import { CloseIcon, CheckIcon, DownloadIcon } from './Icons';

// ── Mini circular progress per item ──────────────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MiniProgress: React.FC<{ progress: number; color: string; status: QueueItemStatus }> = ({
    progress,
    color,
    status,
}) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const size = 36;
    const radius = 14;
    const circumference = 2 * Math.PI * radius;

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: Math.max(0, Math.min(progress, 100)),
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const strokeDashoffset = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
    });

    if (status === 'done') {
        return (
            <View style={[styles.miniDone, { backgroundColor: `${Colors.success}20`, borderColor: Colors.success }]}>
                <CheckIcon size={16} color={Colors.success} />
            </View>
        );
    }

    if (status === 'failed') {
        return (
            <View style={[styles.miniDone, { backgroundColor: `${Colors.error}20`, borderColor: Colors.error }]}>
                <Text style={{ color: Colors.error, fontSize: 16, fontWeight: Typography.weights.bold }}>✕</Text>
            </View>
        );
    }

    if (status === 'cancelled') {
        return (
            <View style={[styles.miniDone, { backgroundColor: `${Colors.textMuted}15`, borderColor: Colors.border }]}>
                <Text style={{ color: Colors.textMuted, fontSize: 14 }}>—</Text>
            </View>
        );
    }

    if (status === 'waiting') {
        return (
            <View style={[styles.miniDone, { backgroundColor: `${Colors.primary}10`, borderColor: Colors.border }]}>
                <DownloadIcon size={14} color={Colors.textMuted} />
            </View>
        );
    }

    // downloading
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={Colors.border} strokeWidth={3}
                    fill="none" opacity={0.3}
                />
                <AnimatedCircle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={color} strokeWidth={3}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={StyleSheet.absoluteFill as any}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color, fontSize: 8, fontWeight: Typography.weights.bold }}>
                        {Math.round(progress)}%
                    </Text>
                </View>
            </View>
        </View>
    );
};

// ── Status badge label ────────────────────────────────────────────────────────
const StatusLabel: React.FC<{ status: QueueItemStatus; eta: number }> = ({ status, eta }) => {
    const config: Record<QueueItemStatus, { label: string; color: string }> = {
        waiting: { label: 'WAITING', color: Colors.textMuted },
        downloading: { label: eta > 0 ? `${Math.round(eta)}s left` : 'DOWNLOADING', color: Colors.primary },
        done: { label: 'DONE', color: Colors.success },
        failed: { label: 'FAILED', color: Colors.error },
        cancelled: { label: 'CANCELLED', color: Colors.textMuted },
    };
    const { label, color } = config[status];
    return <Text style={[styles.statusBadge, { color }]}>{label}</Text>;
};

// ── Single queue row ──────────────────────────────────────────────────────────
const QueueRow: React.FC<{
    item: QueueItem;
    platformColor: string;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
}> = ({ item, platformColor, onCancel, onRetry }) => {
    const color = item.status === 'downloading' ? platformColor : Colors.primary;

    return (
        <View style={[styles.row, item.status === 'downloading' && styles.rowActive]}>
            <MiniProgress progress={item.progress} color={color} status={item.status} />

            <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.rowMeta}>
                    <Text style={styles.rowAuthor} numberOfLines={1}>{item.author}</Text>
                    <StatusLabel status={item.status} eta={item.eta} />
                </View>
                {item.status === 'downloading' && (
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${item.progress}%` as any, backgroundColor: color }]} />
                    </View>
                )}
                {item.status === 'failed' && item.errorMessage && (
                    <Text style={styles.errorMsg} numberOfLines={1}>{item.errorMessage}</Text>
                )}
            </View>

            {/* Action button */}
            {(item.status === 'waiting' || item.status === 'downloading') && (
                <TouchableOpacity style={styles.rowAction} onPress={() => onCancel(item.id)}>
                    <CloseIcon size={14} color={Colors.textMuted} />
                </TouchableOpacity>
            )}
            {item.status === 'failed' && (
                <TouchableOpacity style={[styles.rowAction, styles.retryBtn]} onPress={() => onRetry(item.id)}>
                    <Text style={styles.retryText}>↺</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

// ── Main Panel ────────────────────────────────────────────────────────────────
interface DownloadQueuePanelProps {
    visible: boolean;
    onClose: () => void;
    queue: QueueItem[];
    isRunning: boolean;
    totalDone: number;
    totalFailed: number;
    platformColor: string;
    onCancelItem: (id: string) => void;
    onCancelAll: () => void;
    onClearQueue: () => void;
    onRetryFailed: () => void;
}

export const DownloadQueuePanel: React.FC<DownloadQueuePanelProps> = ({
    visible,
    onClose,
    queue,
    isRunning,
    totalDone,
    totalFailed,
    platformColor,
    onCancelItem,
    onCancelAll,
    onClearQueue,
    onRetryFailed,
}) => {
    const slideAnim = useRef(new Animated.Value(500)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const handleRetry = useCallback((id: string) => {
        onRetryFailed();
    }, [onRetryFailed]);

    const total = queue.length;
    const waiting = queue.filter(i => i.status === 'waiting').length;
    const downloading = queue.filter(i => i.status === 'downloading').length;

    const renderItem = useCallback(({ item }: { item: QueueItem }) => (
        <QueueRow
            item={item}
            platformColor={platformColor}
            onCancel={onCancelItem}
            onRetry={handleRetry}
        />
    ), [platformColor, onCancelItem, handleRetry]);

    // Added safety check for slideAnim value
    // Note: getAnimatedValue is not a standard React Native method, usually we check __getValue() or just render anyway.
    // In React Native, we can't easily check the value synchronously. 
    // I'll remove the conditional return based on slideAnim value to be safer, or use the visible prop.
    if (!visible && !isRunning && queue.length === 0) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={onClose} activeOpacity={1} />
                <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>

                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Download Queue</Text>
                            <Text style={styles.subtitle}>
                                {downloading > 0 ? `Downloading ${downloading}` : isRunning ? 'Processing...' : 'Queue ready'}
                                {waiting > 0 ? ` · ${waiting} waiting` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <CloseIcon size={20} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Stats row */}
                    <View style={styles.stats}>
                        <View style={styles.statChip}>
                            <Text style={[styles.statNum, { color: Colors.primary }]}>{total}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statChip}>
                            <Text style={[styles.statNum, { color: Colors.success }]}>{totalDone}</Text>
                            <Text style={styles.statLabel}>Done</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statChip}>
                            <Text style={[styles.statNum, { color: Colors.textMuted }]}>{waiting}</Text>
                            <Text style={styles.statLabel}>Waiting</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statChip}>
                            <Text style={[styles.statNum, { color: Colors.error }]}>{totalFailed}</Text>
                            <Text style={styles.statLabel}>Failed</Text>
                        </View>
                    </View>

                    {/* Overall progress bar */}
                    {total > 0 && (
                        <View style={styles.overallBar}>
                            <View style={[
                                styles.overallFill,
                                {
                                    width: `${(totalDone / total) * 100}%` as any,
                                    backgroundColor: platformColor,
                                }
                            ]} />
                        </View>
                    )}

                    {/* Queue list */}
                    <FlatList
                        data={queue}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>Queue is empty</Text>
                            </View>
                        }
                    />

                    {/* Footer actions */}
                    <View style={styles.footer}>
                        {totalFailed > 0 && (
                            <TouchableOpacity style={styles.footerBtn} onPress={onRetryFailed}>
                                <Text style={[styles.footerBtnText, { color: Colors.warning }]}>
                                    Retry Failed ({totalFailed})
                                </Text>
                            </TouchableOpacity>
                        )}
                        {isRunning && (
                            <TouchableOpacity style={styles.footerBtn} onPress={onCancelAll}>
                                <Text style={[styles.footerBtnText, { color: Colors.error }]}>Cancel All</Text>
                            </TouchableOpacity>
                        )}
                        {!isRunning && queue.length > 0 && (
                            <TouchableOpacity style={styles.footerBtn} onPress={onClearQueue}>
                                <Text style={[styles.footerBtnText, { color: Colors.textMuted }]}>Clear Queue</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    panel: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        maxHeight: '82%',
        borderTopWidth: 1,
        borderColor: Colors.border,
        ...Shadows.xl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: Spacing.lg,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    title: {
        fontSize: Typography.sizes.xl,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
    },
    subtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        marginTop: 2,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stats: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    statChip: { alignItems: 'center' },
    statNum: {
        fontSize: Typography.sizes['2xl'],
        fontWeight: Typography.weights.black,
        letterSpacing: -0.5,
    },
    statLabel: {
        fontSize: Typography.sizes.xxs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
        letterSpacing: 1,
        marginTop: 1,
    },
    statDivider: {
        width: 1,
        height: 32,
        backgroundColor: Colors.border,
    },
    overallBar: {
        height: 3,
        backgroundColor: Colors.border,
        marginHorizontal: Spacing.lg,
        borderRadius: BorderRadius.round,
        marginBottom: Spacing.sm,
        overflow: 'hidden',
    },
    overallFill: {
        height: '100%',
        borderRadius: BorderRadius.round,
    },
    list: { flex: 1 },
    listContent: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.lg,
    },
    // Row
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.xs,
    },
    rowActive: {
        backgroundColor: `${Colors.primary}08`,
        borderWidth: 1,
        borderColor: `${Colors.primary}20`,
    },
    miniDone: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.round,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowInfo: { flex: 1 },
    rowTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    rowMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    rowAuthor: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        flex: 1,
    },
    statusBadge: {
        fontSize: 9,
        fontWeight: Typography.weights.bold,
        letterSpacing: 1,
    },
    progressBar: {
        height: 2,
        backgroundColor: Colors.border,
        borderRadius: BorderRadius.round,
        marginTop: Spacing.xs,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: BorderRadius.round,
    },
    errorMsg: {
        fontSize: Typography.sizes.xxs,
        color: Colors.error,
        marginTop: 2,
    },
    rowAction: {
        width: 28,
        height: 28,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    retryBtn: {
        borderColor: Colors.warning,
        backgroundColor: `${Colors.warning}10`,
    },
    retryText: {
        color: Colors.warning,
        fontSize: 16,
        fontWeight: Typography.weights.bold,
    },
    empty: {
        alignItems: 'center',
        padding: Spacing.xxl,
    },
    emptyText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: Spacing.lg,
        padding: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    footerBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surfaceElevated,
    },
    footerBtnText: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
    },
});
