/**
 * Full-screen immersive preview for a library item.
 *
 * Videos use react-native-video with native controls; images fill the stage.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, getPlatformColor } from '../theme';
import {
    CloseIcon,
    ShareIcon,
    TrashIcon,
    VideoIcon,
    MusicNoteIcon,
    TypeIcon,
    getPlatformIcon,
} from './Icons';
import { formatFileSize, YtDlpNative } from '../native/YtDlpModule';
import { deriveMediaKind, formatTileDuration, normalizePlatform } from '../utils/libraryMedia';
import { Haptics } from '../utils/haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PLATFORM_LABELS: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    twitter: 'X',
    x: 'X',
    spotify: 'Spotify',
    pinterest: 'Pinterest',
    soundcloud: 'SoundCloud',
    twitch: 'Twitch',
};

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
    item: PreviewItem;
    onClose: () => void;
    onDelete?: () => void;
}

function MediaPreviewModal({ item, onClose, onDelete }: MediaPreviewModalProps) {
    const videoRef = useRef<VideoRef>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showInfo, setShowInfo] = useState(true);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setShowInfo(true);
    }, [item.path]);

    const kind = deriveMediaKind(item.extension);
    const platformKey = normalizePlatform(item.platform);
    const accent = getPlatformColor(platformKey || item.platform);
    const duration = formatTileDuration(item.duration);
    const PlatformIcon = getPlatformIcon(platformKey);
    const platformName = PLATFORM_LABELS[platformKey] ?? item.platform;

    const handleShare = useCallback(() => {
        Haptics.impact();
        YtDlpNative.shareFile?.(item.path);
    }, [item.path]);

    const isVideo = kind === 'video';
    const isImage = kind === 'image';
    const displayName = item.name.replace(/\.[^.]+$/, '');

    return (
        <Modal
            visible
            animationType="fade"
            transparent
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.backdrop}>
                <View style={styles.stage}>
                    {isVideo && (
                        <>
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
                                            'This video could not be played on this device',
                                    );
                                }}
                            />
                            {loading && !error && (
                                <View style={styles.stageOverlay} pointerEvents="none">
                                    <ActivityIndicator color="#FFF" size="large" />
                                </View>
                            )}
                            {error && (
                                <View style={styles.stageOverlay}>
                                    <VideoIcon size={48} color="rgba(255,255,255,0.45)" />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}
                        </>
                    )}

                    {isImage && (
                        <Image
                            source={{ uri: `file://${item.path}` }}
                            style={styles.image}
                            resizeMode="contain"
                        />
                    )}

                    {!isVideo && !isImage && (
                        <View style={styles.staticStage}>
                            <View style={[styles.staticIconWrap, { backgroundColor: `${accent}22` }]}>
                                {kind === 'audio' ? (
                                    <MusicNoteIcon size={40} color={accent} />
                                ) : (
                                    <TypeIcon size={40} color={accent} />
                                )}
                            </View>
                            <Text style={styles.staticLabel}>
                                {kind === 'audio' ? 'Audio file' : 'Text file'}
                            </Text>
                            <Text style={styles.staticHint}>
                                {kind === 'audio'
                                    ? 'Open with your system player via Share'
                                    : 'Opens in the text viewer'}
                            </Text>
                        </View>
                    )}
                </View>

                <SafeAreaView style={styles.chrome} edges={['top', 'bottom']} pointerEvents="box-none">
                    <View style={styles.topBar}>
                        <Pressable
                            onPress={onClose}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Close preview"
                            style={styles.glassBtn}
                        >
                            <CloseIcon size={18} color="#FFF" />
                        </Pressable>

                        <View style={styles.topBarActions}>
                            <Pressable
                                onPress={handleShare}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Share"
                                style={styles.glassBtn}
                            >
                                <ShareIcon size={18} color="#FFF" />
                            </Pressable>
                            {onDelete ? (
                                <Pressable
                                    onPress={onDelete}
                                    hitSlop={10}
                                    accessibilityRole="button"
                                    accessibilityLabel="Delete"
                                    style={[styles.glassBtn, styles.deleteBtn]}
                                >
                                    <TrashIcon size={18} color="#FFF" />
                                </Pressable>
                            ) : null}
                        </View>
                    </View>

                    <View style={styles.flexSpacer} pointerEvents="none" />

                    {showInfo ? (
                        <Pressable
                            style={styles.infoCard}
                            onPress={() => setShowInfo(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Hide info"
                        >
                            <View style={styles.infoHandle} />

                            <View style={styles.infoHeader}>
                                {PlatformIcon ? (
                                    <View
                                        style={[
                                            styles.platformChip,
                                            { backgroundColor: `${accent}30` },
                                        ]}
                                    >
                                        <PlatformIcon size={14} color={accent} />
                                    </View>
                                ) : null}
                                <View style={styles.infoText}>
                                    <Text style={styles.infoTitle} numberOfLines={2}>
                                        {displayName}
                                    </Text>
                                    <Text style={styles.infoSub} numberOfLines={1}>
                                        {[platformName, duration, formatFileSize(item.size)]
                                            .filter(Boolean)
                                            .join('  ·  ')}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.metaGrid}>
                                <MetaPill
                                    label="Type"
                                    value={(item.mimeType || item.extension).toUpperCase()}
                                />
                                <MetaPill label="Size" value={formatFileSize(item.size)} />
                                {duration ? <MetaPill label="Length" value={duration} /> : null}
                                <MetaPill label="Source" value={platformName || '—'} />
                            </View>
                        </Pressable>
                    ) : (
                        <Pressable
                            style={styles.showInfoBtn}
                            onPress={() => setShowInfo(true)}
                            hitSlop={12}
                        >
                            <Text style={styles.showInfoText}>Details</Text>
                        </Pressable>
                    )}
                </SafeAreaView>
            </View>
        </Modal>
    );
}

function MetaPill({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.metaPill}>
            <Text style={styles.metaPillLabel}>{label}</Text>
            <Text style={styles.metaPillValue} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: '#000',
    },
    stage: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        width: SCREEN_W,
        height: SCREEN_H,
    },
    stageOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 32,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    errorText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    staticStage: {
        alignItems: 'center',
        gap: 12,
        padding: 32,
    },
    staticIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    staticLabel: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '700',
    },
    staticHint: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        textAlign: 'center',
    },
    chrome: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8,
    },
    topBarActions: {
        flexDirection: 'row',
        gap: 10,
    },
    glassBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    deleteBtn: {
        backgroundColor: 'rgba(239,68,68,0.55)',
        borderColor: 'rgba(239,68,68,0.35)',
    },
    flexSpacer: {
        flex: 1,
    },
    infoCard: {
        marginHorizontal: 14,
        marginBottom: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(18,18,22,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
    },
    infoHandle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)',
        marginBottom: 12,
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    platformChip: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoText: {
        flex: 1,
        minWidth: 0,
    },
    infoTitle: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.3,
        lineHeight: 20,
    },
    infoSub: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 3,
    },
    metaGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    metaPill: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        minWidth: '46%',
        flexGrow: 1,
    },
    metaPillLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    metaPillValue: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
    showInfoBtn: {
        alignSelf: 'center',
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    showInfoText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '700',
    },
});

export { MediaPreviewModal };
export default MediaPreviewModal;
