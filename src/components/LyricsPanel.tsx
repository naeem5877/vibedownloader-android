/**
 * Lyrics panel with Word-Sync, Line-Sync, Plain Text and Translation tabs.
 *
 * A direct port of the desktop panel so both clients read identically. The one
 * behavioural difference is playback: the desktop app has a player driving
 * `currentTime`, while mobile only has a download screen. When no time is
 * supplied every line renders in its resting style, which is what the panel
 * falls back to rather than pretending to highlight something.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors, BorderRadius, Spacing } from '../theme';
import {
    AlignLeftIcon,
    CheckIcon,
    ChevronDownIcon,
    DownloadIcon,
    LanguagesIcon,
    MusicNoteIcon,
    SparkleIcon,
    SpinnerIcon,
    TypeIcon,
} from './Icons';
import type { LyricLine, LyricsResult } from '../services/lyrics/types';
import type { ExportMode } from '../services/lyrics/format';
import { saveLyrics } from '../services/LyricsService';
import type { LyricsMetadata } from '../services/LyricsService';

type Mode = 'words' | 'synced' | 'plain' | 'translation';

interface LyricsPanelProps {
    lyrics: LyricsResult | null;
    /** Playback position in seconds. Omitted on the download screen. */
    currentTime?: number;
    defaultCollapsed?: boolean;
    /** Re-resolved on save so the file always matches the panel. */
    metadata: LyricsMetadata;
}

const PURPLE = '#A78BFA';
const PURPLE_DIM = '#8B5CF6';
const PURPLE_BORDER = 'rgba(167, 139, 250, 0.35)';
const PURPLE_TINT = 'rgba(139, 92, 246, 0.18)';

const TABS: { id: Mode; label: string }[] = [
    { id: 'words', label: 'Word-Sync' },
    { id: 'synced', label: 'Line Sync' },
    { id: 'plain', label: 'Plain Text' },
    { id: 'translation', label: 'Translation' },
];

function activeLineIndex(lines: LyricLine[] | undefined, timeMs: number): number {
    if (!lines?.length || timeMs < 0) return -1;
    let found = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].t <= timeMs) found = i;
        else break;
    }
    return found;
}

function formatStamp(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Splits plain text into lines while remembering blank-line verse breaks. */
function plainLines(text: string): { text: string; gapBefore: boolean }[] {
    const out: { text: string; gapBefore: boolean }[] = [];
    let gap = false;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) {
            gap = out.length > 0;
            continue;
        }
        out.push({ text: line, gapBefore: gap });
        gap = false;
    }

    return out;
}

/**
 * Format raw word tokens with natural punctuation and spacing.
 * Eliminates artificial gaps before commas, periods, quotes and parens.
 */
function formatWordsWithNaturalSpacing(
    rawWords: { t: number; d: number; w: string }[]
): { word: { t: number; d: number; w: string }; spaceBefore: boolean }[] {
    const trailingPunct = /^[,.!?:;)\]}"'\u2019\u201d]+$/;
    // `\[` is required: unescaped it opens a nested class and stops matching.
    // eslint-disable-next-line no-useless-escape
    const leadingPunct = /^[({\["'\u2018\u201c]+$/;
    const isCjk = /[\u4e00-\u9fa5\u3040-\u30ff]/;

    return rawWords.map((curr, i) => {
        if (i === 0) return { word: curr, spaceBefore: false };
        const prev = rawWords[i - 1];

        // The token already carries explicit spacing from the parser.
        if (prev.w.endsWith(' ') || curr.w.startsWith(' ')) {
            return { word: curr, spaceBefore: false };
        }

        const prevW = prev.w.trim();
        const currW = curr.w.trim();

        if (trailingPunct.test(currW)) return { word: curr, spaceBefore: false };
        if (leadingPunct.test(prevW) && !trailingPunct.test(prevW)) {
            return { word: curr, spaceBefore: false };
        }
        if (isCjk.test(prevW) && isCjk.test(currW)) {
            return { word: curr, spaceBefore: false };
        }
        return { word: curr, spaceBefore: true };
    });
}

export default function LyricsPanel({
    lyrics,
    currentTime,
    defaultCollapsed = true,
    metadata,
}: LyricsPanelProps) {
    const [mode, setMode] = useState<Mode>('words');
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState('');
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const saveResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Continuous spinner rotation for the save-in-progress state
    const spinAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 800,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [spinAnim]);
    const spinStyle = {
        transform: [{
            rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
        }]
    };

    /** Only the tabs the provider actually returned data for. */
    const available = useMemo<Mode[]>(() => {
        if (!lyrics) return [];
        const out: Mode[] = [];
        if (lyrics.words?.length) out.push('words');
        if (lyrics.synced?.length || lyrics.words?.length) out.push('synced');
        if (lyrics.plain?.trim() || lyrics.synced?.length || lyrics.words?.length) out.push('plain');
        if (lyrics.translation?.length) out.push('translation');
        return out;
    }, [lyrics]);

    const active: Mode = useMemo(() => {
        if (available.includes(mode)) return mode;
        return available[0] || 'plain';
    }, [available, mode]);

    const timeMs =
        typeof currentTime === 'number' && Number.isFinite(currentTime)
            ? Math.max(0, currentTime) * 1000
            : -1;
    const isTimelineActive = timeMs >= 0;

    const wordLines = active === 'words' ? lyrics?.words : undefined;

    const syncedLines = useMemo(() => {
        if (active !== 'synced') return undefined;
        if (lyrics?.synced?.length) return lyrics.synced;
        if (lyrics?.words?.length) return lyrics.words.map((l) => ({ t: l.t, text: l.text }));
        return undefined;
    }, [active, lyrics]);

    const translationLines = active === 'translation' ? lyrics?.translation : undefined;

    const plainText = useMemo(() => {
        if (lyrics?.plain?.trim()) return lyrics.plain;
        const fallback = lyrics?.synced || lyrics?.words;
        if (fallback?.length) return fallback.map((l) => l.text).join('\n');
        return '';
    }, [lyrics]);

    const syncedIndex = activeLineIndex(syncedLines, timeMs);
    const wordIndex = activeLineIndex(wordLines, timeMs);
    const translationIndex = activeLineIndex(translationLines, timeMs);

    useEffect(() => {
        setSaveState('idle');
        setSaveError('');
    }, [lyrics?.title, lyrics?.artist]);

    useEffect(() => {
        setCollapsed(defaultCollapsed);
    }, [lyrics?.title, lyrics?.artist, defaultCollapsed]);

    useEffect(
        () => () => {
            if (saveResetRef.current) clearTimeout(saveResetRef.current);
        },
        []
    );

    const showTitle = lyrics?.displayTitle || lyrics?.title || '';
    const showArtist = lyrics?.displayArtist ?? lyrics?.artist ?? '';

    const handleSave = async () => {
        if (!lyrics || saveState === 'saving') return;

        setSaveState('saving');
        setSaveError('');

        try {
            const res = await saveLyrics(
                { ...metadata, title: lyrics.title, artist: lyrics.artist, isMusic: true },
                active as ExportMode,
                showTitle,
                showArtist
            );

            if (res.success) {
                setSaveState('saved');
            } else {
                setSaveState('error');
                setSaveError(res.error || 'Could not save the lyrics.');
            }
        } catch (e) {
            setSaveState('error');
            setSaveError(e instanceof Error ? e.message : 'Could not save the lyrics.');
        }

        if (saveResetRef.current) clearTimeout(saveResetRef.current);
        saveResetRef.current = setTimeout(() => {
            setSaveState('idle');
            setSaveError('');
        }, 4000);
    };

    const scrollRef = useRef<ScrollView>(null);

    /** Keep the active line centred, the way the desktop panel does. */
    useEffect(() => {
        if (timeMs < 0) return;
        const index =
            active === 'words' ? wordIndex : active === 'synced' ? syncedIndex : translationIndex;
        if (index < 0) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, index * 46 - 140), animated: true });
    }, [timeMs, active, wordIndex, syncedIndex, translationIndex]);

    if (!lyrics || available.length === 0) return null;

    const timeline = wordLines || syncedLines || translationLines;
    const TabIcon = (id: Mode) => {
        switch (id) {
            case 'words':
                return SparkleIcon;
            case 'synced':
                return AlignLeftIcon;
            case 'translation':
                return LanguagesIcon;
            default:
                return TypeIcon;
        }
    };

    const countLabel =
        active === 'words'
            ? `${wordLines?.length ?? 0} word-timed lines`
            : active === 'plain'
                ? 'Full plain lyrics'
                : `${(active === 'synced' ? syncedLines : translationLines)?.length ?? 0} lines`;

    return (
        <View style={styles.card}>
            {/* Header: title, artist, badges, save and collapse */}
            <View style={[styles.header, collapsed && styles.headerCollapsed]}>
                <TouchableOpacity
                    style={styles.headerMain}
                    onPress={() => setCollapsed((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={collapsed ? 'Expand lyrics' : 'Collapse lyrics'}
                >
                    <View style={styles.iconBadge}>
                        <MusicNoteIcon size={16} color={PURPLE} />
                    </View>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.headerTitle}>Lyrics</Text>
                        {available.includes('words') ? (
                            <View style={[styles.badge, styles.badgePurple]}>
                                <SparkleIcon size={9} color={PURPLE} />
                                <Text style={styles.badgePurpleText}>WORD-SYNC</Text>
                            </View>
                        ) : available.includes('synced') ? (
                            <View style={[styles.badge, styles.badgeBlue]}>
                                <Text style={styles.badgeBlueText}>SYNCED</Text>
                            </View>
                        ) : null}
                        <Text style={styles.headerMeta} numberOfLines={1}>
                            • {showTitle}
                            {showArtist ? ` (${showArtist})` : ''}
                        </Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.saveButton}
                        onPress={handleSave}
                        disabled={saveState === 'saving'}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Save lyrics"
                    >
                        {saveState === 'saving' ? (
                            <Animated.View style={spinStyle}><SpinnerIcon size={13} color={PURPLE} /></Animated.View>
                        ) : saveState === 'saved' ? (
                            <CheckIcon size={13} color={Colors.success} />
                        ) : saveState === 'error' ? (
                            <Text style={styles.saveErrorMark}>!</Text>
                        ) : (
                            <DownloadIcon size={13} color={PURPLE} />
                        )}
                        <Text style={styles.saveButtonText}>
                            {saveState === 'saved' ? 'Saved' : 'Save'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.chevronButton}
                        onPress={() => setCollapsed((v) => !v)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={collapsed ? 'Expand lyrics' : 'Collapse lyrics'}
                    >
                        <View style={collapsed ? undefined : styles.chevronUp}>
                            <ChevronDownIcon size={16} color={collapsed ? Colors.textMuted : Colors.textSecondary} />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {!collapsed && (
                <View>
                    {/* Segmented tab bar */}
                    <View style={styles.tabBar}>
                        <View style={styles.tabGroup}>
                            {TABS.filter((t) => available.includes(t.id)).map((tab) => {
                                const Icon = TabIcon(tab.id);
                                const isActive = active === tab.id;
                                return (
                                    <TouchableOpacity
                                        key={tab.id}
                                        style={[styles.tab, isActive && styles.tabActive]}
                                        onPress={() => setMode(tab.id)}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isActive }}
                                    >
                                        <Icon size={13} color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)'} />
                                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                            {tab.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {saveState === 'error' && saveError ? (
                        <View style={styles.errorBar}>
                            <Text style={styles.errorText}>{saveError}</Text>
                        </View>
                    ) : null}

                    {/* Lyrics body */}
                    <ScrollView
                        ref={scrollRef}
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        nestedScrollEnabled
                    >
                        {active === 'plain' && plainText ? (
                            <View>
                                {plainLines(plainText).map((line, i) => (
                                    <Text
                                        key={i}
                                        style={[styles.plainLine, line.gapBefore && styles.plainGap]}
                                    >
                                        {line.text}
                                    </Text>
                                ))}
                            </View>
                        ) : null}

                        {active === 'synced'
                            ? (syncedLines || []).map((line, i) => {
                                const isActiveLine = i === syncedIndex && isTimelineActive;
                                return (
                                    <View
                                        key={`${line.t}-${i}`}
                                        style={[
                                            styles.syncedRow,
                                            isActiveLine && styles.rowActive,
                                        ]}
                                    >
                                        <Text style={styles.stamp}>{formatStamp(line.t)}</Text>
                                        <Text
                                            style={[
                                                styles.rowText,
                                                isActiveLine
                                                    ? styles.rowTextActive
                                                    : isTimelineActive
                                                        ? styles.rowTextDim
                                                        : styles.rowTextIdle,
                                            ]}
                                        >
                                            {line.text}
                                        </Text>
                                    </View>
                                );
                            })
                            : null}

                        {active === 'words'
                            ? (wordLines || []).map((line, i) => {
                                const isActiveLine = i === wordIndex && isTimelineActive;
                                return (
                                    <View
                                        key={`${line.t}-${i}`}
                                        style={[
                                            styles.wordRow,
                                            isActiveLine && styles.rowActive,
                                        ]}
                                    >
                                        {line.words?.length ? (
                                            <Text style={styles.wordText}>
                                                {formatWordsWithNaturalSpacing(line.words).map(
                                                    ({ word, spaceBefore }, wi) => {
                                                        const wordActive =
                                                            isActiveLine &&
                                                            timeMs >= word.t &&
                                                            timeMs < word.t + Math.max(word.d, 120);
                                                        return (
                                                            <Text key={`${word.t}-${wi}`}>
                                                                {spaceBefore ? ' ' : ''}
                                                                <Text
                                                                    style={
                                                                        wordActive
                                                                            ? styles.wordActive
                                                                            : isTimelineActive && !isActiveLine
                                                                                ? styles.wordDim
                                                                                : undefined
                                                                    }
                                                                >
                                                                    {word.w.trim()}
                                                                </Text>
                                                            </Text>
                                                        );
                                                    }
                                                )}
                                            </Text>
                                        ) : (
                                            <Text
                                                style={[
                                                    styles.rowText,
                                                    isActiveLine
                                                        ? styles.rowTextActive
                                                        : isTimelineActive && !isActiveLine
                                                            ? styles.rowTextDim
                                                            : styles.rowTextIdle,
                                                ]}
                                            >
                                                {line.text}
                                            </Text>
                                        )}
                                    </View>
                                );
                            })
                            : null}

                        {active === 'translation'
                            ? (translationLines || []).map((line, i) => {
                                const isActiveLine = i === translationIndex && isTimelineActive;
                                return (
                                    <View
                                        key={`${line.t}-${i}`}
                                        style={[
                                            styles.syncedRow,
                                            isActiveLine && styles.rowActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.rowText,
                                                isActiveLine
                                                    ? styles.rowTextActive
                                                    : isTimelineActive
                                                        ? styles.rowTextDim
                                                        : styles.rowTextIdle,
                                            ]}
                                        >
                                            {line.text}
                                        </Text>
                                    </View>
                                );
                            })
                            : null}

                        {/* Original line under the translation, matching desktop. */}
                        {active === 'translation' && syncedIndex >= 0 && syncedLines?.[syncedIndex] ? (
                            <Text style={styles.translationHint}>{syncedLines[syncedIndex].text}</Text>
                        ) : null}
                    </ScrollView>

                    {timeline && timeline.length > 0 ? (
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>
                                {active === 'words'
                                    ? `${wordLines?.length ?? 0} word-timed lines`
                                    : `${timeline.length} lines`}
                            </Text>
                            {timeMs >= 0 ? (
                                <Text style={styles.footerTime}>{formatStamp(timeMs)}</Text>
                            ) : null}
                        </View>
                    ) : null}

                    {!timeline || timeline.length === 0 ? (
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>{countLabel}</Text>
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.25)',
        backgroundColor: 'rgba(10, 6, 20, 0.7)',
        overflow: 'hidden',
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.02)',
        gap: Spacing.sm,
    },
    headerCollapsed: {
        borderBottomWidth: 0,
    },
    headerMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    iconBadge: {
        width: 32,
        height: 32,
        borderRadius: 12,
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderWidth: 1,
        borderColor: PURPLE_BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs + 2,
        flex: 1,
    },
    headerTitle: {
        color: Colors.textPrimary,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    headerMeta: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        flexShrink: 1,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: BorderRadius.round,
        borderWidth: 1,
    },
    badgePurple: {
        backgroundColor: 'rgba(139, 92, 246, 0.22)',
        borderColor: 'rgba(167, 139, 250, 0.35)',
    },
    badgePurpleText: {
        color: PURPLE,
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    badgeBlue: {
        backgroundColor: 'rgba(59, 130, 246, 0.22)',
        borderColor: 'rgba(96, 165, 250, 0.35)',
    },
    badgeBlueText: {
        color: '#93C5FD',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs + 2,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    saveButtonText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    saveErrorMark: {
        color: Colors.errorLight,
        fontSize: 12,
        fontWeight: '900',
    },
    chevronButton: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronUp: {
        transform: [{ rotate: '180deg' }],
    },
    tabBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm + 2,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    tabGroup: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        flexWrap: 'wrap',
        gap: 2,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    tabActive: {
        backgroundColor: PURPLE_DIM,
        borderColor: 'rgba(167, 139, 250, 0.4)',
    },
    tabText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontWeight: '700',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    errorBar: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(239, 68, 68, 0.2)',
    },
    errorText: {
        color: Colors.errorLight,
        fontSize: 12,
    },
    scroll: {
        maxHeight: 380,
        minHeight: 200,
    },
    scrollContent: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
    },
    plainLine: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 24,
    },
    plainGap: {
        marginTop: 12,
    },
    syncedRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 6,
    },
    wordRow: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 6,
    },
    rowActive: {
        backgroundColor: PURPLE_TINT,
        borderColor: PURPLE_BORDER,
    },
    stamp: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 11,
        width: 38,
        textAlign: 'right',
        marginTop: 2,
    },
    rowText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    rowTextIdle: {
        color: 'rgba(255,255,255,0.8)',
    },
    rowTextDim: {
        color: 'rgba(255,255,255,0.4)',
    },
    rowTextActive: {
        color: PURPLE,
        fontWeight: '600',
    },
    wordText: {
        fontSize: 14.5,
        lineHeight: 21,
        color: 'rgba(255,255,255,0.8)',
    },
    wordActive: {
        color: PURPLE,
        fontWeight: '700',
    },
    wordDim: {
        color: 'rgba(255,255,255,0.4)',
    },
    translationHint: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontStyle: 'italic',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    footerText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
    },
    footerTime: {
        color: 'rgba(167, 139, 250, 0.7)',
        fontSize: 11,
    },
});
