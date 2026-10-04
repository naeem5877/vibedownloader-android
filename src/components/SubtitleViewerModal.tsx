import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Clipboard,
    FlatList,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, BorderRadius, Spacing, Typography, getPlatformColor } from '../theme';
import { AlignLeftIcon, CaptionsIcon, CloseIcon, MusicNoteIcon, SearchIcon } from './Icons';
import { YtDlpNative } from '../native/YtDlpModule';
import { parseLrc, parseSrt, parseVtt, lyricLinesToCues } from '../services/lyrics/parsers';
import type { SubtitleCue } from '../services/lyrics/types';

/** Extensions we can time-align, and the badge shown for each. */
const CUE_EXTENSIONS: Record<string, string> = {
    srt: 'SRT',
    vtt: 'VTT',
    lrc: 'LRC',
};

export interface SubtitleViewerFile {
    path: string;
    name: string;
    platform?: string;
    size?: number;
}

interface Props {
    file: SubtitleViewerFile | null;
    onClose: () => void;
}

type Loaded = {
    kind: 'cues' | 'plain';
    cues: SubtitleCue[];
    /** Kept for plain-text files so they can be shown without inventing timings. */
    plain: string[];
    /** True when the file parsed as timed cues but had no usable content. */
    empty: boolean;
};

const isCueFile = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Renders a cue start as `h:mm:ss` / `m:ss`, matching the source precision. */
function formatStamp(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function SubtitleViewerModal({ file, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Loaded | null>(null);
    const [query, setQuery] = useState('');

    const extension = file ? isCueFile(file.name) : '';
    const badge = CUE_EXTENSIONS[extension] ?? extension.toUpperCase() ?? 'TEXT';
    const accent = getPlatformColor(file?.platform);

    useEffect(() => {
        if (!file) return;
        let cancelled = false;

        setLoading(true);
        setError(null);
        setData(null);
        setQuery('');

        YtDlpNative.readTextFile(file.path)
            .then((content) => {
                if (cancelled) return;

                let parsed: Loaded;
                if (extension === 'srt') {
                    parsed = { kind: 'cues', cues: parseSrt(content), plain: [], empty: false };
                } else if (extension === 'vtt') {
                    parsed = { kind: 'cues', cues: parseVtt(content), plain: [], empty: false };
                } else if (extension === 'lrc') {
                    parsed = {
                        kind: 'cues',
                        cues: lyricLinesToCues(parseLrc(content)),
                        plain: [],
                        empty: false,
                    };
                } else {
                    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
                    parsed = { kind: 'plain', cues: [], plain: lines, empty: false };
                }
                parsed.empty =
                    parsed.kind === 'cues'
                        ? parsed.cues.length === 0
                        : parsed.plain.length === 0;
                console.log(
                    `[SubtitleViewer] ${file.name} kind=${parsed.kind} ` +
                        `cues=${parsed.cues.length} plain=${parsed.plain.length} ` +
                        `first=${JSON.stringify((parsed.cues[0]?.text ?? parsed.plain[0] ?? '').slice(0, 40))}`
                );
                setData(parsed);
            })
            .catch((e) => {
                if (!cancelled) setError(e?.message ?? 'Could not read this file');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [file, extension]);

    const rows = useMemo(() => {
        if (!data) return [];
        const source = data.kind === 'cues' ? data.cues.map((c) => c.text) : data.plain;
        const needle = query.trim().toLowerCase();
        // Keep the original index on each row: FlatList hands back the index
        // within the *filtered* list, which would otherwise shift timestamps.
        const indexed = source.map((text, i) => ({ key: String(i), index: i, text }));
        return needle ? indexed.filter((r) => r.text.toLowerCase().includes(needle)) : indexed;
    }, [data, query]);

    const totalMs =
        data?.kind === 'cues' && data.cues.length > 0 ? data.cues[data.cues.length - 1].end : 0;

    const handleCopy = useCallback((text: string) => {
        Clipboard.setString(text);
    }, []);

    const cueFor = useCallback(
        (index: number) => (data?.kind === 'cues' ? data.cues[index] : undefined),
        [data]
    );

    if (!file) return null;

    const totalCues = data ? (data.kind === 'cues' ? data.cues.length : data.plain.length) : 0;
    const unit = data?.kind === 'cues' ? 'cues' : 'lines';

    let countLabel = '';
    if (data && !data.empty) {
        countLabel = rows.length === totalCues ? `${totalCues} ${unit}` : `${rows.length} of ${totalCues}`;
    }
    const durationLabel = totalMs > 0 ? `  ·  ${formatStamp(totalMs)}` : '';

    return (
        <Modal
            visible={!!file}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent={false}
        >
            <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

                <View style={[styles.header, { borderBottomColor: `${accent}33` }]}>
                    <View style={[styles.headerIcon, { backgroundColor: `${accent}1F` }]}>
                        {extension === 'lrc' ? (
                            <MusicNoteIcon size={18} color={accent} />
                        ) : (
                            <CaptionsIcon size={18} color={accent} />
                        )}
                    </View>

                    <View style={styles.headerText}>
                        <Text style={styles.title} numberOfLines={1}>
                            {file.name}
                        </Text>
                        <Text style={styles.subtitle}>
                            {`${badge}${countLabel ? `  ·  ${countLabel}` : ''}${durationLabel}`}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <CloseIcon size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.searchBar}>
                    <SearchIcon size={15} color={Colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search"
                        placeholderTextColor={Colors.textMuted}
                        autoCorrect={false}
                        selectionColor={accent}
                    />
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={accent} />
                        <Text style={styles.centerText}>Reading file…</Text>
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Text style={styles.errorTitle}>Could not open this file</Text>
                        <Text style={styles.centerText}>{error}</Text>
                    </View>
                ) : !data || data.empty ? (
                    <View style={styles.center}>
                        <AlignLeftIcon size={26} color={Colors.textMuted} />
                        <Text style={styles.centerText}>
                            {extension === 'lrc' || extension === 'srt' || extension === 'vtt'
                                ? 'No timed cues found in this file.'
                                : 'This file is empty.'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={rows}
                        keyExtractor={(item) => item.key}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={20}
                        windowSize={11}
                        removeClippedSubviews
                        ListEmptyComponent={
                            <View style={styles.center}>
                                <Text style={styles.centerText}>No lines match “{query.trim()}”.</Text>
                            </View>
                        }
                        renderItem={({ item }) => {
                            const cue = cueFor(item.index);
                            return (
                                <TouchableOpacity
                                    style={styles.row}
                                    activeOpacity={0.6}
                                    onPress={() => handleCopy(item.text)}
                                >
                                    {cue ? (
                                        <Text style={[styles.stamp, { color: `${accent}B0` }]}>
                                            {formatStamp(cue.start)}
                                        </Text>
                                    ) : (
                                        <View style={styles.stampSpacer} />
                                    )}
                                    <Text style={styles.rowText}>{item.text}</Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.innerBorder,
        backgroundColor: Colors.surfaceLow,
    },
    headerIcon: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: { flex: 1 },
    title: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    subtitle: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        letterSpacing: Typography.letterSpacing.wide,
        textTransform: 'uppercase',
        marginTop: 2,
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },

    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.md,
        height: 38,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    searchInput: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        padding: 0,
    },

    listContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 2 },

    row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm },
    stamp: {
        width: 44,
        fontSize: Typography.sizes.xs,
        fontFamily: 'monospace',
        paddingTop: 2,
    },
    stampSpacer: { width: 44 },
    rowText: {
        flex: 1,
        fontSize: Typography.sizes.lg,
        lineHeight: Typography.sizes.lg * 1.5,
        color: Colors.textSecondary,
    },

    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
        padding: Spacing.xl,
    },
    centerText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    errorTitle: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.error,
    },
});
