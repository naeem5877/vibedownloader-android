/**
 * Audio language selector.
 *
 * Direct match to desktop's SectionToggle + AudioTrackChoice with emerald theme.
 * Preselects original track. Hidden when fewer than 2 audio languages are published.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../theme';
import { WaveformIcon, CheckIcon, ChevronDownIcon } from './Icons';
import type { AudioTrack } from '../native/YtDlpModule';

export interface AudioTrackSelectorProps {
    tracks: AudioTrack[];
    /**
     * Currently selected track `key`, or null to let yt-dlp pick.
     *
     * The selection is tracked by `key` rather than `formatId` because an itag
     * identifies a codec and bitrate, not a language: several dubbed tracks
     * routinely share one itag, so matching on it would light up every row at
     * once.
     */
    selectedKey: string | null;
    onSelect: (track: AudioTrack) => void;
    /** True when the current download is audio-only, which changes what the choice means. */
    isAudioOnly?: boolean;
}

const EMERALD = '#10B981';
const EMERALD_BG = 'rgba(16, 185, 129, 0.15)';
const EMERALD_BORDER = 'rgba(16, 185, 129, 0.3)';
const EMERALD_TEXT = '#6EE7B7';

export default function AudioTrackSelector({
    tracks,
    selectedKey,
    onSelect,
    isAudioOnly = false,
}: AudioTrackSelectorProps) {
    // Collapsed by default, matching SubtitlePicker: most videos publish a single
    // audio language and hide this card entirely, so opening it expanded on the
    // rare ones leaves an empty panel on screen before anything is selected.
    const [collapsed, setCollapsed] = useState(true);

    /** Original language first, then alphabetical, so the order is stable. */
    const ordered = useMemo(() => {
        return [...tracks].sort((a, b) => {
            if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
            return a.langLabel.localeCompare(b.langLabel);
        });
    }, [tracks]);

    const activeTrack = useMemo(() => {
        return tracks.find((t) => t.key === selectedKey)
            || tracks.find((t) => t.isOriginal)
            || tracks[0];
    }, [tracks, selectedKey]);

    // Kept for readability at the call site; the choice itself is the language.
    void isAudioOnly;

    if (tracks.length < 2) return null;

    const metaText = activeTrack
        ? `${activeTrack.langLabel}${activeTrack.isOriginal ? ' · original' : ''} · ${tracks.length} tracks`
        : `${tracks.length} audio tracks`;

    return (
        <View style={styles.card}>
            {/* Header: SectionToggle matching desktop */}
            <TouchableOpacity
                style={styles.header}
                onPress={() => setCollapsed((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={collapsed ? 'Expand audio tracks' : 'Collapse audio tracks'}
            >
                <View style={styles.headerLeft}>
                    <View style={styles.iconWrap}>
                        <WaveformIcon size={16} color={EMERALD} />
                    </View>
                    <View style={styles.headerTitleWrap}>
                        <View style={styles.titleRow}>
                            <Text style={styles.titleText}>AUDIO TRACKS</Text>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {activeTrack?.isOriginal ? 'ORIGINAL' : `${tracks.length} TRACKS`}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.metaSubtitle} numberOfLines={1}>
                            {metaText}
                        </Text>
                    </View>
                </View>
                <View style={[styles.chevronWrap, !collapsed && styles.chevronExpanded]}>
                    <ChevronDownIcon size={16} color={Colors.textMuted} />
                </View>
            </TouchableOpacity>

            {/* Expanded List: AudioTrackChoice rows */}
            {!collapsed && (
                <View style={styles.body}>
                    <View style={styles.divider} />
                    <View style={styles.trackList}>
                        {ordered.map((track) => {
                            const isSelected = track.key === selectedKey;
                            const langCode = (track.lang || 'en').split('-')[0].toUpperCase();

                            return (
                                <TouchableOpacity
                                    key={track.key}
                                    style={[styles.trackRow, isSelected && styles.trackRowSelected]}
                                    onPress={() => onSelect(track)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={`${track.langLabel} audio track`}
                                >
                                    {/* Language code badge */}
                                    <View style={[styles.langCodeBadge, isSelected && styles.langCodeBadgeSelected]}>
                                        <Text style={[styles.langCodeText, isSelected && styles.langCodeTextSelected]}>
                                            {langCode}
                                        </Text>
                                    </View>

                                    {/* Track label */}
                                    <Text style={[styles.trackLabel, isSelected && styles.trackLabelSelected]} numberOfLines={1}>
                                        {track.langLabel}
                                    </Text>

                                    {/* Original badge */}
                                    {track.isOriginal && (
                                        <View style={styles.originalPill}>
                                            <Text style={styles.originalPillText}>ORIGINAL</Text>
                                        </View>
                                    )}

                                    {/* Bitrate / Codec */}
                                    <Text style={styles.trackBitrate}>
                                        {track.abr > 0 ? `${Math.round(track.abr)}kbps` : track.ext?.toUpperCase() || 'AUDIO'}
                                    </Text>

                                    {/* Radio indicator */}
                                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                                        {isSelected && <CheckIcon size={11} color="#FFFFFF" />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
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
        borderColor: 'rgba(16, 185, 129, 0.22)',
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
        backgroundColor: EMERALD_BG,
        borderWidth: 1,
        borderColor: EMERALD_BORDER,
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
        backgroundColor: EMERALD_BG,
        borderWidth: 1,
        borderColor: EMERALD_BORDER,
    },
    badgeText: {
        color: EMERALD_TEXT,
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
    trackList: {
        paddingVertical: Spacing.xs,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm + 2,
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    trackRowSelected: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderLeftColor: EMERALD,
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
    langCodeBadgeSelected: {
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        borderColor: EMERALD_BORDER,
    },
    langCodeText: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
        fontFamily: 'monospace',
    },
    langCodeTextSelected: {
        color: EMERALD_TEXT,
    },
    trackLabel: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    trackLabelSelected: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    originalPill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BorderRadius.xs,
        backgroundColor: EMERALD_BG,
        borderWidth: 1,
        borderColor: EMERALD_BORDER,
    },
    originalPillText: {
        color: EMERALD_TEXT,
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    trackBitrate: {
        color: Colors.textMuted,
        fontSize: 11,
        fontFamily: 'monospace',
    },
    radioCircle: {
        width: 18,
        height: 18,
        borderRadius: BorderRadius.round,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioCircleSelected: {
        borderColor: EMERALD,
        backgroundColor: EMERALD,
    },
});
