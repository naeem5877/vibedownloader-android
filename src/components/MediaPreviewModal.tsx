/**
 * Full-screen preview for a single library item.
 *
 * Videos play in-app through react-native-video instead of being handed to
 * another app, so previewing no longer leaves the library. Images use a plain
 * local URI, which needs no save step.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius, getPlatformColor } from '../theme';
import { CloseIcon, ShareIcon, TrashIcon, VideoIcon, MusicNoteIcon, TypeIcon } from './Icons';
import { formatFileSize, YtDlpNative } from '../native/YtDlpModule';
import { deriveMediaKind, formatTileDuration } from '../utils/libraryMedia';
import { Haptics } from '../utils/haptics';

const { width: SCREEN_W } = Dimensions.get('window');

export interface PreviewItem {
    name: string;
    path: string;
    size: number;
    platform: string;
    extension: string;
    thumbnail?: string | null;
    duration?: number;
    mimeType?: string;
}

interface MediaPreviewModalProps {
    item: PreviewItem | null;
    onClose: () => void;
    onDelete?: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
    item,
    onClose,
    onDelete,
}) => {
    const videoRef = useRef<VideoRef>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const kind = item ? deriveMediaKind(item.extension) : 'image';
    const accent = item ? getPlatformColor(item.platform) : Colors.primary;
    const duration = item ? formatTileDuration(item.duration) : null;

    const handleShare = useCallback(() => {
        if (!item) return;
        Haptics.impact();
        YtDlpNative.shareFile?.(item.path);
    }, [item]);

    if (!item) return null;

    const isVideo = kind === 'video';
    const isImage = kind === 'image';

    return (
        <Modal visible animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.backdrop}>
                <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
                    <View style={styles.header}>
                        <Pressable
                            onPress={onClose}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Close preview"
                            style={styles.iconBtn}
                        >
                            <CloseIcon size={22} color="#FFF" />
                        </Pressable>

                        <View style={styles.headerText}>
                            <Text style={styles.title} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {[item.platform, duration, formatFileSize(item.size)]
                                    .filter(Boolean)
                                    .join('  ·  ')}
                            </Text>
                        </View>

                        <View style={styles.headerActions}>
                            <Pressable
                                onPress={handleShare}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Share"
                                style={styles.iconBtn}
                            >
                                <ShareIcon size={20} color="#FFF" />
                            </Pressable>
                            {onDelete && (
                                <Pressable
                                    onPress={onDelete}
                                    hitSlop={10}
                                    accessibilityRole="button"
                                    accessibilityLabel="Delete"
                                    style={styles.iconBtn}
                                >
                                    <TrashIcon size={20} color={Colors.errorLight} />
                                </Pressable>
                            )}
                        </View>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.body}
                        showsVerticalScrollIndicator={false}
                    >
                        {isVideo && (
                            <View style={styles.stage}>
                                <Video
                                    ref={videoRef}
                                    source={{ uri: `file://${item.path}` }}
                                    style={StyleSheet.absoluteFill}
                                    resizeMode="contain"
                                    controls
                                    paused={false}
                                    onLoad={() => setLoading(false)}
                                    onError={(e) => {
                                        setLoading(false);
                                        setError(
                                            e?.error?.errorString ??
                                                'This video could not be played on this device'
                                        );
                                    }}
                                />
                                {loading && !error && (
                                    <View style={styles.stageOverlay} pointerEvents="none">
                                        <ActivityIndicator color="#FFF" />
                                    </View>
                                )}
                                {error && (
                                    <View style={styles.stageOverlay}>
                                        <VideoIcon size={40} color="rgba(255,255,255,0.5)" />
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {isImage && (
                            <View style={styles.stage}>
                                <Image
                                    source={{ uri: `file://${item.path}` }}
                                    style={styles.image}
                                    resizeMode="contain"
                                />
                            </View>
                        )}

                        {/* Audio and text have no inline stage, so lead with the
                            type badge rather than leaving a blank area. */}
                        {!isVideo && !isImage && (
                            <View style={[styles.stage, styles.staticStage]}>
                                {kind === 'audio' ? (
                                    <MusicNoteIcon size={56} color={accent} />
                                ) : (
                                    <TypeIcon size={56} color={accent} />
                                )}
                                <Text style={styles.staticLabel}>
                                    {kind === 'audio' ? 'Audio file' : 'Text file'}
                                </Text>
                                <Text style={styles.staticHint}>
                                    {kind === 'audio'
                                        ? 'Use the controls below to play'
                                        : 'Opens in the text viewer'}
                                </Text>
                            </View>
                        )}

                        <View style={styles.metaCard}>
                            <MetaRow label="Type" value={item.mimeType || item.extension.toUpperCase()} />
                            <MetaRow label="Size" value={formatFileSize(item.size)} />
                            <MetaRow label="Platform" value={item.platform} />
                            {duration && <MetaRow label="Duration" value={duration} />}
                            <Text style={styles.path} numberOfLines={2} selectable>
                                {item.path}
                            </Text>
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </Modal>
    );
};

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue} numberOfLines={1}>
            {value}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000' },
    root: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    headerText: { flex: 1 },
    headerActions: { flexDirection: 'row', gap: Spacing.xs },
    title: {
        color: '#FFF',
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: Typography.sizes.xs,
        marginTop: 1,
    },
    body: { padding: Spacing.md, paddingBottom: Spacing.xl },
    stage: {
        width: SCREEN_W - Spacing.md * 2,
        aspectRatio: 16 / 9,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        backgroundColor: '#0B0B0D',
        alignItems: 'center',
        justifyContent: 'center',
    },
    staticStage: { gap: Spacing.sm, padding: Spacing.lg },
    staticLabel: {
        color: '#FFF',
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
    },
    staticHint: { color: 'rgba(255,255,255,0.5)', fontSize: Typography.sizes.sm },
    image: { width: '100%', height: '100%' },
    stageOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
    },
    errorText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: Typography.sizes.sm,
        textAlign: 'center',
    },
    metaCard: {
        marginTop: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: Spacing.md,
        gap: Spacing.xs,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    metaLabel: { color: 'rgba(255,255,255,0.5)', fontSize: Typography.sizes.sm },
    metaValue: { color: '#FFF', fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium },
    path: {
        marginTop: Spacing.xs,
        color: 'rgba(255,255,255,0.4)',
        fontSize: Typography.sizes.xxs,
    },
});