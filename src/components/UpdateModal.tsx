/**
 * Update Modal - shown when a newer release is available on GitHub.
 * Everything shown comes from the release itself: version, date, the APK that
 * matches this device, its size, and the full structured notes.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Animated,
    Linking,
    ScrollView,
    useWindowDimensions,
} from 'react-native';
import { Colors, Typography, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon } from './Icons';
import { ReleaseNotesView } from './ReleaseNotesView';
import { UpdateInfo, dismissUpdate } from '../services/GitHubUpdateService';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';

interface UpdateModalProps {
    visible: boolean;
    onClose: () => void;
    info: UpdateInfo;
}

const ABI_LABELS: Record<string, string> = {
    'arm64-v8a': 'arm64',
    'armeabi-v7a': 'arm 32-bit',
    x86_64: 'x86_64',
    x86: 'x86',
    universal: 'universal',
};

const formatSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

const formatDate = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const UpdateModal: React.FC<UpdateModalProps> = ({ visible, onClose, info }) => {
    const { height } = useWindowDimensions();
    const scaleAnim = useRef(new Animated.Value(0.94)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, tension: 90, friction: 13, useNativeDriver: true }),
                Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            scaleAnim.setValue(0.94);
            opacityAnim.setValue(0);
        }
    }, [visible, scaleAnim, opacityAnim]);

    // In a Modal inside the Download <-> Library swipe area: keep the screen behind still.
    useEffect(() => {
        if (!visible) return;
        return acquireTabSwipeLock();
    }, [visible]);

    const meta = useMemo(() => {
        const parts: string[] = [];
        const date = formatDate(info.publishedAt);
        if (date) parts.push(date);
        if (info.downloadUrl && info.assetAbi) {
            const size = formatSize(info.assetSize);
            const abi = ABI_LABELS[info.assetAbi] ?? info.assetAbi;
            parts.push(size ? `${abi} \u00b7 ${size}` : abi);
        }
        return parts.join('   \u2022   ');
    }, [info]);

    const handleLater = () => {
        dismissUpdate(info.version);
        onClose();
    };

    const handleDownload = () => {
        Linking.openURL(info.downloadUrl || info.releaseUrl).catch(() => { /* no browser */ });
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={handleLater} statusBarTranslucent>
            <View style={styles.overlay}>
                <Animated.View
                    style={[
                        styles.card,
                        { maxHeight: height * 0.82, opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.iconWrap}>
                            <SparkleIcon size={22} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.label}>Update available</Text>
                            <Text style={styles.title}>
                                v{info.currentVersion}
                                <Text style={styles.arrow}>{'  \u2192  '}</Text>
                                v{info.version}
                            </Text>
                            {!!meta && <Text style={styles.meta}>{meta}</Text>}
                        </View>
                    </View>

                    {/* Notes */}
                    <ScrollView
                        style={styles.notes}
                        contentContainerStyle={styles.notesInner}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                    >
                        <ReleaseNotesView notes={info.notes} />
                        <TouchableOpacity onPress={() => Linking.openURL(info.releaseUrl).catch(() => {})} style={styles.fullNotes}>
                            <Text style={styles.fullNotesText}>View full release on GitHub</Text>
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Actions */}
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={handleLater} activeOpacity={0.7}>
                            <Text style={styles.secondaryBtnText}>Not now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primaryBtn} onPress={handleDownload} activeOpacity={0.85}>
                            <DownloadIcon size={18} color="#FFF" />
                            <Text style={styles.primaryBtnText}>Download</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 22,
        paddingTop: 22,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.innerBorder,
    },
    iconWrap: {
        width: 48,
        height: 48,
        borderRadius: 15,
        backgroundColor: `${Colors.primary}18`,
        borderWidth: 1,
        borderColor: `${Colors.primary}30`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: { flex: 1 },
    label: {
        fontSize: 11,
        fontWeight: Typography.weights.bold,
        color: Colors.primary,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    title: {
        fontSize: 20,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    arrow: { color: Colors.textMuted, fontWeight: Typography.weights.medium },
    meta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

    notes: { flexGrow: 0, flexShrink: 1 },
    notesInner: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 },
    fullNotes: { marginTop: 10, paddingVertical: 8, alignSelf: 'flex-start' },
    fullNotesText: {
        fontSize: 13,
        color: Colors.primaryLight,
        fontWeight: Typography.weights.semibold,
        textDecorationLine: 'underline',
    },

    actions: {
        flexDirection: 'row',
        gap: 10,
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.innerBorder,
    },
    secondaryBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    secondaryBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
    primaryBtn: {
        flex: 1.4,
        backgroundColor: Colors.primary,
        borderRadius: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...Shadows.glow(Colors.primary),
    },
    primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
});

export default UpdateModal;
