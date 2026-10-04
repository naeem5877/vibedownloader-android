import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';
import { CloseIcon, ClipboardIcon, LayersIcon, RefreshIcon, InfoIcon, CheckIcon } from './Icons';
import { parseBatchUrls, detectPlatform } from '../utils/batchUrls';
import { YtDlpNative } from '../native/YtDlpModule';
import { CookieManagerService } from '../services/CookieManagerService';

export interface BatchResolvedItem {
    title: string;
    author: string;
    url: string;
    type: string;
    thumbnail?: string;
    cookies?: string;
}

interface BatchDownloadSheetProps {
    visible: boolean;
    onClose: () => void;
    onStart: (items: BatchResolvedItem[], formatId: string | null) => void;
}

/** Ceiling on metadata lookups so a huge paste cannot stall the sheet. */
const MAX_ITEMS = 50;

const PLATFORM_LABELS: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    twitter: 'X',
    spotify: 'Spotify',
    reddit: 'Reddit',
    other: 'Other',
};

export const BatchDownloadSheet: React.FC<BatchDownloadSheetProps> = ({ visible, onClose, onStart }) => {
    const [raw, setRaw] = useState('');
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const parsed = useMemo(() => parseBatchUrls(raw), [raw]);
    const { urls, duplicates, rejected, platforms } = parsed;

    const tooMany = urls.length > MAX_ITEMS;
    const canStart = urls.length > 0 && !tooMany && !resolving;

    const reset = useCallback(() => {
        setRaw('');
        setError(null);
        setResolving(false);
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await YtDlpNative.getClipboardText();
            if (text) setRaw(text);
        } catch {
            setError('Could not read the clipboard.');
        }
    }, []);

    /**
     * Resolves each pasted link to a title before it enters the queue, so rows
     * show something meaningful instead of a raw url. A link that cannot be
     * resolved is dropped with a reason rather than failing later inside the
     * queue, where the user has no way to tell which one broke.
     */
    const handleStart = useCallback(async () => {
        if (!canStart) return;
        setResolving(true);
        setError(null);

        const items: BatchResolvedItem[] = [];
        const failures: string[] = [];

        for (const url of urls) {
            try {
                // Cookies must be looked up per url, otherwise a paste mixing
                // YouTube and Instagram would share the wrong cookie jar.
                const platform = detectPlatform(url);
                const cookies = platform !== 'other'
                    ? await CookieManagerService.getCookiesForPlatform(platform).catch(() => null)
                    : null;

                const info = await YtDlpNative.fetchInfo(url, { cookies: cookies || undefined });
                items.push({
                    title: info.title || 'Unknown title',
                    author: info.uploader || '',
                    url,
                    type: detectTypeFromUrl(url),
                    thumbnail: info.thumbnail,
                    cookies: cookies || undefined,
                });
            } catch {
                failures.push(url);
            }
        }

        setResolving(false);

        if (items.length === 0) {
            setError('None of those links could be read. Check they are public and correct.');
            return;
        }

        onStart(items, null);

        if (failures.length > 0) {
            setError(`Skipped ${failures.length} link${failures.length > 1 ? 's' : ''} that could not be read.`);
        }
        reset();
    }, [canStart, urls, onStart, reset]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
                <View style={styles.sheet}>
                    <View style={styles.grabber} />

                    <View style={styles.header}>
                        <View style={styles.headerBadge}>
                            <LayersIcon size={18} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>Batch Download</Text>
                            <Text style={styles.subtitle}>
                                {urls.length > 0
                                    ? `${urls.length} link${urls.length > 1 ? 's' : ''} ready to queue`
                                    : 'Paste links, one per line'}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                            <CloseIcon size={20} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputWrap}>
                        <TextInput
                            style={styles.input}
                            value={raw}
                            onChangeText={setRaw}
                            placeholder={'https://youtube.com/watch?v=...\nhttps://instagram.com/reel/...\nhttps://x.com/.../status/...'}
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            numberOfLines={6}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            textAlignVertical="top"
                        />
                        <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste} disabled={resolving}>
                            <ClipboardIcon size={14} color={Colors.primary} />
                            <Text style={styles.pasteText}>Paste</Text>
                        </TouchableOpacity>
                    </View>

                    {urls.length > 0 && (
                        <View style={styles.summary}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.chips}
                                contentContainerStyle={styles.chipsContent}
                            >
                                {Object.entries(platforms).map(([name, count]) => (
                                    <View key={name} style={styles.chip}>
                                        <Text style={styles.chipCount}>{count}</Text>
                                        <Text style={styles.chipText}>
                                            {PLATFORM_LABELS[name] ?? name}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>

                            <View style={styles.notes}>
                                {duplicates.length > 0 && (
                                    <View style={styles.noteRow}>
                                        <RefreshIcon size={12} color={Colors.textMuted} />
                                        <Text style={styles.noteText}>
                                            {duplicates.length} duplicate{duplicates.length > 1 ? 's' : ''} ignored
                                        </Text>
                                    </View>
                                )}
                                {rejected.length > 0 && (
                                    <View style={styles.noteRow}>
                                        <InfoIcon size={12} color={Colors.warning} />
                                        <Text style={[styles.noteText, { color: Colors.warning }]}>
                                            {rejected.length} line{rejected.length > 1 ? 's' : ''} not a link
                                        </Text>
                                    </View>
                                )}
                                {duplicates.length === 0 && rejected.length === 0 && (
                                    <View style={styles.noteRow}>
                                        <CheckIcon size={12} color={Colors.success} />
                                        <Text style={styles.noteText}>All links look good</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {tooMany && (
                        <Text style={styles.error}>
                            Only {MAX_ITEMS} links can be queued at once. Remove {urls.length - MAX_ITEMS}.
                        </Text>
                    )}
                    {error && <Text style={styles.error}>{error}</Text>}

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={handleClose}
                            disabled={resolving}
                        >
                            <Text style={styles.secondaryText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryBtn, !canStart && styles.primaryBtnDisabled]}
                            onPress={handleStart}
                            disabled={!canStart}
                        >
                            {resolving ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <LayersIcon size={16} color="#fff" />
                                    <Text style={styles.primaryText}>
                                        {urls.length > 0 ? `Add ${urls.length} to queue` : 'Add to queue'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

/** Queue `type` values are consumed by the native downloader, so keep them aligned. */
function detectTypeFromUrl(url: string): string {
    switch (detectPlatform(url)) {
        case 'instagram': return 'instagram';
        case 'facebook': return 'facebook';
        case 'tiktok': return 'tiktok';
        case 'twitter': return 'twitter';
        case 'spotify': return 'spotify';
        default: return 'youtube';
    }
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)' },
    sheet: {
        backgroundColor: Colors.surfaceElevated,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        paddingBottom: Spacing.xl,
        borderTopWidth: 1,
        borderColor: Colors.border,
        ...Shadows.xl,
    },
    grabber: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: Colors.border,
        alignSelf: 'center', marginTop: Spacing.sm,
    },
    header: {
        flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    },
    headerBadge: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${Colors.primary}1F`,
        marginRight: 12,
    },
    headerText: { flex: 1 },
    title: {
        fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.textPrimary,
    },
    subtitle: { fontSize: Typography.sizes.sm, color: Colors.textMuted, marginTop: 2 },
    closeBtn: {
        width: 36, height: 36, borderRadius: BorderRadius.round,
        backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    inputWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    input: {
        minHeight: 130,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        paddingRight: 84,
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        fontFamily: Platform.select({ android: 'monospace', default: undefined }),
    },
    pasteBtn: {
        position: 'absolute', right: Spacing.md, top: Spacing.md,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: Spacing.sm, paddingVertical: 6,
        borderRadius: BorderRadius.md,
        backgroundColor: `${Colors.primary}18`,
    },
    pasteText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: Typography.weights.semibold },
    summary: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    notes: { marginTop: Spacing.sm, gap: 4 },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    noteText: { fontSize: Typography.sizes.xs, color: Colors.textMuted, flex: 1 },
    chips: { flexGrow: 0 },
    chipsContent: { gap: 6 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    chipCount: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.black,
        color: Colors.primary,
    },
    chipText: {
        fontSize: Typography.sizes.xxs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.medium,
    },
    error: {
        paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
        fontSize: Typography.sizes.xs, color: Colors.error, lineHeight: 16,
    },
    footer: {
        flexDirection: 'row', gap: Spacing.sm,
        paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg,
    },
    secondaryBtn: {
        flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface, alignItems: 'center',
        borderWidth: 1, borderColor: Colors.border,
    },
    secondaryText: { color: Colors.textMuted, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold },
    primaryBtn: {
        flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.primary, alignItems: 'center',
        flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm,
    },
    primaryBtnDisabled: { opacity: 0.4 },
    primaryText: { color: '#fff', fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold },
});
