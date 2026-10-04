/**
 * Caption track picker.
 *
 * Direct match to desktop's SectionToggle + SubtitleChoice with blue theme.
 */

import React, { useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors, BorderRadius, Spacing } from '../theme';
import {
    CaptionsIcon,
    CheckIcon,
    ChevronDownIcon,
    CloseIcon,
    DownloadIcon,
    SearchIcon,
    SpinnerIcon,
} from './Icons';
import type { SubtitleTrack } from '../native/YtDlpModule';

type SubtitleFormat = 'srt' | 'vtt';
type SourceFilter = 'all' | 'manual' | 'auto';

export interface SubtitlePickerProps {
    tracks: SubtitleTrack[];
    /** Invoked with the chosen track; the parent owns the download and toast. */
    onDownload: (track: SubtitleTrack, format: SubtitleFormat) => void;
    /** Key of the track currently downloading, so only that row shows a spinner. */
    downloadingKey?: string | null;
    /** Key of the last track that finished, for the inline check mark. */
    downloadedKey?: string | null;
}

const BLUE = '#3B82F6';
const BLUE_BG = 'rgba(59, 130, 246, 0.15)';
const BLUE_BORDER = 'rgba(59, 130, 246, 0.3)';
const BLUE_TEXT = '#93C5FD';

const FILTERS: { id: SourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'manual', label: 'Creator' },
    { id: 'auto', label: 'Auto' },
];

export default function SubtitlePicker({
    tracks,
    onDownload,
    downloadingKey = null,
    downloadedKey = null,
}: SubtitlePickerProps) {
    const [collapsed, setCollapsed] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<SourceFilter>('all');
    const [format, setFormat] = useState<SubtitleFormat>('srt');

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();

        return tracks.filter((t) => {
            if (filter === 'manual' && t.isAuto) return false;
            if (filter === 'auto' && !t.isAuto) return false;
            if (!q) return true;
            return (
                t.label.toLowerCase().includes(q) ||
                t.langLabel.toLowerCase().includes(q) ||
                t.lang.toLowerCase().includes(q)
            );
        });
    }, [tracks, query, filter]);

    const manualCount = tracks.filter((t) => !t.isAuto).length;
    const autoCount = tracks.length - manualCount;

    if (!tracks.length) return null;

    return (
        <View style={styles.card}>
            {/* Header: SectionToggle matching desktop */}
            <TouchableOpacity
                style={styles.header}
                onPress={() => setCollapsed((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={collapsed ? 'Expand subtitles' : 'Collapse subtitles'}
            >
                <View style={styles.headerLeft}>
                    <View style={styles.iconWrap}>
                        <CaptionsIcon size={16} color={BLUE} />
                    </View>
                    <View style={styles.headerTitleWrap}>
                        <View style={styles.titleRow}>
                            <Text style={styles.titleText}>SUBTITLES</Text>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{tracks.length} TRACKS</Text>
                            </View>
                        </View>
                        <Text style={styles.metaSubtitle} numberOfLines={1}>
                            {manualCount} by creator · {autoCount} auto-generated
                        </Text>
                    </View>
                </View>
                <View style={[styles.chevronWrap, !collapsed && styles.chevronExpanded]}>
                    <ChevronDownIcon size={16} color={Colors.textMuted} />
                </View>
            </TouchableOpacity>

            {!collapsed && (
                <View style={styles.body}>
                    <View style={styles.divider} />

                    {/* Filter and Format Controls */}
                    <View style={styles.controls}>
                        <View style={styles.searchBox}>
                            <SearchIcon size={13} color={Colors.textMuted} />
                            <TextInput
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                placeholder={`Search ${tracks.length} languages…`}
                                placeholderTextColor={Colors.textMuted}
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            {query.length > 0 && (
                                <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
                                    <CloseIcon size={13} color={Colors.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.controlRow}>
                            {/* Source Filter */}
                            <View style={styles.filterGroup}>
                                {FILTERS.map((f) => (
                                    <TouchableOpacity
                                        key={f.id}
                                        style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
                                        onPress={() => setFilter(f.id)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
                                            {f.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Format Toggle */}
                            <View style={styles.formatGroup}>
                                {(['srt', 'vtt'] as SubtitleFormat[]).map((f) => (
                                    <TouchableOpacity
                                        key={f}
                                        style={[styles.formatChip, format === f && styles.formatChipActive]}
                                        onPress={() => setFormat(f)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.formatText, format === f && styles.formatTextActive]}>
                                            {f.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>

                    {/* Subtitle Rows */}
                    {visible.length === 0 ? (
                        <Text style={styles.emptyText}>No languages match your search.</Text>
                    ) : (
                        <ScrollView style={styles.list} nestedScrollEnabled>
                            {visible.map((track) => {
                                const isDownloading = downloadingKey === track.key;
                                const isDone = !isDownloading && downloadedKey === track.key;
                                const langCode = (track.lang || 'en').split('-')[0].toUpperCase();

                                return (
                                    <TouchableOpacity
                                        key={track.key}
                                        style={styles.row}
                                        onPress={() => onDownload(track, format)}
                                        disabled={isDownloading || !!downloadingKey}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Download ${track.label} subtitles`}
                                    >
                                        {/* Lang Code Badge */}
                                        <View style={styles.langCodeBadge}>
                                            <Text style={styles.langCodeText}>{langCode}</Text>
                                        </View>

                                        {/* Language Title */}
                                        <View style={styles.rowTextWrap}>
                                            <Text style={styles.rowLabel} numberOfLines={1}>
                                                {track.langLabel}
                                            </Text>
                                            <Text style={styles.rowMeta} numberOfLines={1}>
                                                {track.isAuto ? 'Auto-generated' : 'Author uploaded'} · {format.toUpperCase()}
                                            </Text>
                                        </View>

                                        {/* Type Badge */}
                                        <View style={[styles.typeBadge, !track.isAuto ? styles.typeBadgeCreator : styles.typeBadgeAuto]}>
                                            <Text style={[styles.typeBadgeText, !track.isAuto ? styles.typeBadgeTextCreator : styles.typeBadgeTextAuto]}>
                                                {!track.isAuto ? 'CREATOR' : 'AUTO'}
                                            </Text>
                                        </View>

                                        {/* Download status / action */}
                                        <View style={styles.actionWrap}>
                                            {isDownloading ? (
                                                <SpinnerIcon size={16} color={BLUE} />
                                            ) : isDone ? (
                                                <View style={styles.doneCheck}>
                                                    <CheckIcon size={12} color="#FFFFFF" />
                                                </View>
                                            ) : (
                                                <View style={styles.downloadCircle}>
                                                    <DownloadIcon size={13} color={Colors.textSecondary} />
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        borderRadius: BorderRadius.xl,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.22)',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        flex: 1,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.lg,
        backgroundColor: BLUE_BG,
        borderWidth: 1,
        borderColor: BLUE_BORDER,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitleWrap: {
        flex: 1,
        gap: 2,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    titleText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    badge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: BorderRadius.round,
        backgroundColor: BLUE_BG,
        borderWidth: 1,
        borderColor: BLUE_BORDER,
    },
    badgeText: {
        color: BLUE_TEXT,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    metaSubtitle: {
        color: Colors.textMuted,
        fontSize: 11,
    },
    chevronWrap: {
        width: 28,
        height: 28,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronExpanded: {
        transform: [{ rotate: '180deg' }],
    },
    body: {
        paddingBottom: Spacing.xs,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    controls: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Spacing.sm + 2,
        paddingVertical: 7,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
    searchInput: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: 13,
        padding: 0,
    },
    controlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
    },
    filterGroup: {
        flexDirection: 'row',
        padding: 2,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    filterChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BorderRadius.xs,
    },
    filterChipActive: {
        backgroundColor: BLUE,
    },
    filterText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '700',
    },
    filterTextActive: {
        color: '#FFFFFF',
    },
    formatGroup: {
        flexDirection: 'row',
        padding: 2,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    formatChip: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: BorderRadius.xs,
    },
    formatChipActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
    },
    formatText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
    },
    formatTextActive: {
        color: '#FFFFFF',
    },
    emptyText: {
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
        paddingVertical: Spacing.lg,
    },
    list: {
        maxHeight: 280,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm + 2,
        paddingHorizontal: Spacing.md,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    langCodeBadge: {
        width: 38,
        height: 24,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    langCodeText: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
        fontFamily: 'monospace',
    },
    rowTextWrap: {
        flex: 1,
        gap: 2,
    },
    rowLabel: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
    },
    rowMeta: {
        color: Colors.textMuted,
        fontSize: 11,
    },
    typeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BorderRadius.xs,
        borderWidth: 1,
    },
    typeBadgeCreator: {
        backgroundColor: BLUE_BG,
        borderColor: BLUE_BORDER,
    },
    typeBadgeAuto: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    typeBadgeText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    typeBadgeTextCreator: {
        color: BLUE_TEXT,
    },
    typeBadgeTextAuto: {
        color: Colors.textMuted,
    },
    actionWrap: {
        width: 30,
        height: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    downloadCircle: {
        width: 26,
        height: 26,
        borderRadius: BorderRadius.round,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    doneCheck: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.success,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
