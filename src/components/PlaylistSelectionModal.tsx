import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Modal, TouchableOpacity, Image, StyleSheet, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius, Shadows, getOnPlatformColor } from '../theme';
import { DownloadIcon, CloseIcon, CheckIcon, VideoIcon, MusicIcon, MusicNoteIcon, SearchIcon } from './Icons';

interface PlaylistItem {
    id: string;
    title: string; // Video title or track name
    author: string; // Artist or channel
    duration?: string;
    thumbnail?: string;
    url: string; // Actual URL to download (e.g. YouTube video URL or search query)
    originalUrl?: string; // Original Spotify/YT URL
    type?: string; // platform type like 'instagram', 'facebook', 'youtube'
    isReel?: boolean; // If true, it's a folder/highlight reel that can be opened
}

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onDownload: (selectedItems: PlaylistItem[], formatId: string) => void;
    playlistTitle: string;
    playlistImage?: string;
    items: PlaylistItem[];
    platformColor: string;
    isLoading?: boolean;
    /** True while later pages are still arriving. The list is usable, but the download buttons wait. */
    isLoadingMore?: boolean;
    onItemPress?: (item: PlaylistItem) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** "3:34" or "1:02:10" → seconds. Unknown / live → 0. */
const parseDuration = (d?: string): number => {
    if (!d) return 0;
    const parts = d.split(':').map(Number);
    if (parts.some(n => Number.isNaN(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
};

/** 11520 → "3 hr 12 min", 540 → "9 min". */
const formatTotal = (seconds: number): string => {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} hr ${m} min`;
    return `${Math.max(1, m)} min`;
};

// Fixed row height lets the list jump and virtualise without measuring rows.
const ROW_HEIGHT = 60;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;

// ─── Album art ─────────────────────────────────────────────────────────────

/** Per-track cover. Falls back to a music-note tile when there is no art or it fails to load. */
const TrackArt = React.memo(({ uri, size, radius }: { uri?: string; size: number; radius: number }) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [uri]);

    const box = { width: size, height: size, borderRadius: radius };

    if (!uri || failed) {
        return (
            <View style={[styles.artPlaceholder, box]}>
                <MusicNoteIcon size={Math.round(size * 0.42)} color={Colors.textMuted} />
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={[styles.artImage, box]}
            resizeMode="cover"
            fadeDuration={150}
            onError={() => setFailed(true)}
        />
    );
});

/** Header cover: the playlist's own image, else a 2×2 collage of the first tracks' art. */
const PlaylistCover = ({
    uri,
    items,
    color,
    size,
}: {
    uri?: string;
    items: PlaylistItem[];
    color: string;
    size: number;
}) => {
    const thumbs = useMemo(
        () => items.map(i => i.thumbnail).filter((t): t is string => !!t).slice(0, 4),
        [items],
    );
    const half = size / 2;

    let body: React.ReactNode;
    if (uri) {
        body = <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />;
    } else if (thumbs.length >= 4) {
        body = (
            <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}>
                {thumbs.map((t, idx) => (
                    <Image key={idx} source={{ uri: t }} style={{ width: half, height: half }} resizeMode="cover" />
                ))}
            </View>
        );
    } else if (thumbs.length > 0) {
        body = <Image source={{ uri: thumbs[0] }} style={{ width: size, height: size }} resizeMode="cover" />;
    } else {
        body = (
            <View style={[styles.coverEmpty, { width: size, height: size }]}>
                <MusicNoteIcon size={size * 0.4} color={Colors.textMuted} />
            </View>
        );
    }

    return (
        <View style={[styles.coverShadow, Shadows.glowSm(color), { width: size, height: size }]}>
            <View style={styles.coverClip}>{body}</View>
        </View>
    );
};

// ─── Track row ─────────────────────────────────────────────────────────────

interface TrackRowProps {
    item: PlaylistItem;
    selected: boolean;
    color: string;
    onColor: string;
    onPress: (item: PlaylistItem) => void;
}

const TrackRow = React.memo(({ item, selected, color, onColor, onPress }: TrackRowProps) => (
    <TouchableOpacity
        style={[
            styles.itemRow,
            selected && { backgroundColor: `${color}14`, borderColor: `${color}33` },
        ]}
        onPress={() => onPress(item)}
        activeOpacity={0.75}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${item.title}${item.author ? `, ${item.author}` : ''}`}
    >
        <TrackArt uri={item.thumbnail} size={44} radius={10} />

        <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
            </Text>
            {!!item.author && (
                <Text style={styles.itemAuthor} numberOfLines={1}>
                    {item.author}
                </Text>
            )}
        </View>

        {!!item.duration && <Text style={styles.itemDuration}>{item.duration}</Text>}

        <View style={[styles.checkbox, selected && { backgroundColor: color, borderColor: color }]}>
            {selected && <CheckIcon size={13} color={onColor} />}
        </View>
    </TouchableOpacity>
));

// ─── Modal ─────────────────────────────────────────────────────────────────

const QUALITY_OPTIONS = [
    { id: 'audio_best', label: 'Best', caption: 'Highest quality' },
    { id: 'audio_standard', label: 'Standard', caption: 'Balanced' },
    { id: 'audio_low', label: 'Low', caption: 'Smallest size' },
];

export const PlaylistSelectionModal: React.FC<PlaylistSelectionModalProps> = ({
    visible,
    onClose,
    onDownload,
    playlistTitle,
    playlistImage,
    items,
    platformColor,
    isLoading,
    isLoadingMore,
    onItemPress,
}) => {
    const insets = useSafeAreaInsets();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const knownIdsRef = useRef<Set<string>>(new Set());
    const onColor = getOnPlatformColor(platformColor);
    const [query, setQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);

    // A fresh open always starts with an empty search.
    useEffect(() => {
        if (!visible) {
            setQuery('');
            setSearchFocused(false);
        }
    }, [visible]);

    // Items start out selected. When a list grows (later pages of a mix or a
    // long playlist), only the NEW items are auto-selected so anything the user
    // already deselected stays deselected.
    useEffect(() => {
        if (items.length === 0) {
            knownIdsRef.current = new Set();
            setSelectedIds(new Set());
            return;
        }
        const present = new Set(items.map(i => i.id));
        const fresh = items.filter(i => !knownIdsRef.current.has(i.id)).map(i => i.id);
        knownIdsRef.current = present;
        setSelectedIds(prev => {
            const next = new Set<string>();
            prev.forEach(id => present.has(id) && next.add(id));
            fresh.forEach(id => next.add(id));
            return next;
        });
    }, [items]);

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleRowPress = useCallback(
        (item: PlaylistItem) => {
            if (item.isReel && onItemPress) {
                onItemPress(item);
            } else {
                toggleSelection(item.id);
            }
        },
        [onItemPress, toggleSelection],
    );

    const trimmedQuery = query.trim().toLowerCase();
    const isSearching = trimmedQuery.length > 0;

    // Search matches the title or the artist. Selection and downloads still use
    // the full list, so tracks hidden by a search stay selected.
    const visibleItems = useMemo(() => {
        if (!isSearching) return items;
        return items.filter(
            i =>
                i.title.toLowerCase().includes(trimmedQuery) ||
                (i.author || '').toLowerCase().includes(trimmedQuery),
        );
    }, [items, isSearching, trimmedQuery]);

    // Select all / None act on what is on screen: the whole list normally,
    // just the matches while a search is active.
    const selectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            visibleItems.forEach(i => next.add(i.id));
            return next;
        });
    };

    const deselectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            visibleItems.forEach(i => next.delete(i.id));
            return next;
        });
    };

    const handleDownload = (formatId: string) => {
        const selectedItems = items.filter(i => selectedIds.has(i.id));
        onDownload(selectedItems, formatId);
    };

    const isStoryMode = items.length > 0 && ['instagram', 'facebook'].includes(items[0].type || '');
    const selectedCount = selectedIds.size;
    const hasSelection = selectedCount > 0;
    const allSelected = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id));
    const noneVisibleSelected = !visibleItems.some(i => selectedIds.has(i.id));

    const totalLabel = useMemo(
        () => formatTotal(items.reduce((sum, i) => sum + parseDuration(i.duration), 0)),
        [items],
    );

    const renderItem = useCallback(
        ({ item }: { item: PlaylistItem }) => (
            <TrackRow
                item={item}
                selected={selectedIds.has(item.id)}
                color={platformColor}
                onColor={onColor}
                onPress={handleRowPress}
            />
        ),
        [selectedIds, platformColor, onColor, handleRowPress],
    );

    const renderStoryItem = ({ item }: { item: PlaylistItem }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.storyGridItem, isSelected && { borderColor: platformColor, borderWidth: 2 }]}
                onPress={() => handleRowPress(item)}
                activeOpacity={0.8}
            >
                {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.storyThumbnail} />
                ) : (
                    <View style={[styles.storyThumbnail, { backgroundColor: Colors.surfaceElevated }]} />
                )}
                <View style={styles.storyGradient} />

                {item.isReel ? (
                    <View style={[styles.storyCheckbox, { backgroundColor: 'rgba(0,0,0,0.7)', borderColor: platformColor }]}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: platformColor }} />
                    </View>
                ) : (
                    <View style={[styles.storyCheckbox, isSelected ? { backgroundColor: platformColor, borderColor: platformColor } : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: '#FFF' }]}>
                        {isSelected && <CheckIcon size={12} color={onColor} />}
                    </View>
                )}

                {item.duration && (
                    <View style={styles.storyDurationContainer}>
                        <Text style={styles.storyDurationText}>{item.duration}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.grabber} />

                    {/* Header */}
                    <View style={styles.header}>
                        <PlaylistCover uri={playlistImage} items={items} color={platformColor} size={68} />

                        <View style={styles.headerText}>
                            <Text style={[styles.eyebrow, { color: platformColor }]}>
                                {isStoryMode ? 'STORIES' : 'PLAYLIST'}
                            </Text>
                            <Text style={styles.playlistTitle} numberOfLines={2}>
                                {playlistTitle}
                            </Text>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaText}>
                                    {items.length} {isStoryMode ? 'stories' : items.length === 1 ? 'track' : 'tracks'}
                                </Text>
                                {!!totalLabel && !isStoryMode && (
                                    <>
                                        <View style={styles.metaDot} />
                                        <Text style={styles.metaText}>{totalLabel}</Text>
                                    </>
                                )}
                                {isLoadingMore && (
                                    <>
                                        <View style={styles.metaDot} />
                                        <ActivityIndicator size="small" color={platformColor} style={styles.metaSpinner} />
                                        <Text style={styles.metaText}>loading more</Text>
                                    </>
                                )}
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <CloseIcon size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Search (tracks only; story grids have no useful text to match) */}
                    {!isStoryMode && items.length > 0 && !isLoading && (
                        <View style={[styles.searchBar, searchFocused && { borderColor: `${platformColor}66` }]}>
                            <SearchIcon size={18} color={searchFocused ? platformColor : Colors.textMuted} />
                            <TextInput
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                                placeholder={`Search ${items.length} tracks`}
                                placeholderTextColor={Colors.textMuted}
                                selectionColor={platformColor}
                                returnKeyType="search"
                                onSubmitEditing={Keyboard.dismiss}
                                autoCorrect={false}
                                autoCapitalize="none"
                                accessibilityLabel="Search tracks"
                            />
                            {query.length > 0 && (
                                <TouchableOpacity
                                    onPress={() => setQuery('')}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Clear search"
                                >
                                    <View style={styles.searchClear}>
                                        <CloseIcon size={12} color={Colors.textPrimary} />
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Selection controls */}
                    <View style={styles.controls}>
                        <View style={styles.selectionControls}>
                            <TouchableOpacity
                                onPress={selectAll}
                                style={[
                                    styles.chip,
                                    allSelected && { backgroundColor: `${platformColor}1F`, borderColor: `${platformColor}55` },
                                ]}
                            >
                                <Text style={[styles.chipText, allSelected && { color: platformColor }]}>
                                    {isSearching ? 'Select results' : 'Select all'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={deselectAll}
                                style={[
                                    styles.chip,
                                    noneVisibleSelected && { backgroundColor: Colors.glassFillStrong, borderColor: Colors.glassBorder },
                                ]}
                            >
                                <Text style={[styles.chipText, noneVisibleSelected && { color: Colors.textPrimary }]}>None</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.selectionSummary}>
                            <Text style={{ color: hasSelection ? platformColor : Colors.textMuted }}>{selectedCount}</Text>
                            {` of ${items.length} selected`}
                        </Text>
                    </View>

                    {/* List */}
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={platformColor} size="large" />
                            <Text style={styles.loadingText}>Loading tracks...</Text>
                        </View>
                    ) : (
                        <FlatList
                            key={isStoryMode ? 'grid-3' : 'list-1'}
                            data={isStoryMode ? items : visibleItems}
                            extraData={selectedIds}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            ListEmptyComponent={
                                isSearching ? (
                                    <View style={styles.emptyResults}>
                                        <SearchIcon size={28} color={Colors.textMuted} />
                                        <Text style={styles.emptyTitle}>No matches</Text>
                                        <Text style={styles.emptyText} numberOfLines={2}>
                                            Nothing in this playlist matches “{query.trim()}”.
                                        </Text>
                                    </View>
                                ) : null
                            }
                            renderItem={isStoryMode ? renderStoryItem : renderItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={[styles.listContent, isStoryMode && styles.gridContent]}
                            showsVerticalScrollIndicator={false}
                            numColumns={isStoryMode ? 3 : 1}
                            columnWrapperStyle={isStoryMode ? styles.gridRow : undefined}
                            getItemLayout={
                                isStoryMode
                                    ? undefined
                                    : (_data, index) => ({ length: ROW_STRIDE, offset: ROW_STRIDE * index, index })
                            }
                            initialNumToRender={12}
                            maxToRenderPerBatch={12}
                            windowSize={7}
                            removeClippedSubviews
                        />
                    )}

                    {/* Footer Action — locked while later pages are still arriving so a
                        download can never silently miss the tracks that are on their way. */}
                    {/* Hidden while the search box has focus so the keyboard leaves room for results. */}
                    {!searchFocused && (
                    <View
                        style={[
                            styles.footer,
                            { paddingBottom: Spacing.xl + insets.bottom },
                            isLoadingMore && { opacity: 0.5 },
                        ]}
                        pointerEvents={isLoadingMore ? 'none' : 'auto'}
                    >
                        {isStoryMode ? (
                            <TouchableOpacity
                                style={[
                                    styles.videoBatchBtn,
                                    { backgroundColor: hasSelection ? platformColor : Colors.surfaceElevated },
                                    !hasSelection && { opacity: 0.4 },
                                ]}
                                disabled={!hasSelection}
                                onPress={() => handleDownload('best')}
                            >
                                <DownloadIcon size={18} color={hasSelection ? onColor : Colors.textMuted} />
                                <Text style={[styles.videoBatchBtnText, { color: hasSelection ? onColor : Colors.textMuted }]}>
                                    Download Stories {hasSelection ? `(${selectedCount})` : ''}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <>
                                <Text style={styles.sectionLabel}>AUDIO ONLY</Text>
                                <View style={styles.footerRow}>
                                    {QUALITY_OPTIONS.map(opt => (
                                        <TouchableOpacity
                                            key={opt.id}
                                            style={[
                                                styles.batchBtn,
                                                { backgroundColor: `${platformColor}14`, borderColor: `${platformColor}33` },
                                                !hasSelection && { opacity: 0.4 },
                                            ]}
                                            disabled={!hasSelection}
                                            onPress={() => handleDownload(opt.id)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Download audio, ${opt.label} quality`}
                                        >
                                            <View style={styles.batchBtnTop}>
                                                <MusicIcon size={14} color={platformColor} />
                                                <Text style={[styles.batchBtnText, { color: platformColor }]}>{opt.label}</Text>
                                            </View>
                                            <Text style={styles.batchBtnCaption}>{opt.caption}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {platformColor !== '#1DB954' && ( // Don't show video for Spotify (Green color used here as proxy)
                                    <TouchableOpacity
                                        style={[
                                            styles.videoBatchBtn,
                                            { backgroundColor: hasSelection ? platformColor : Colors.surfaceElevated },
                                        ]}
                                        disabled={!hasSelection}
                                        onPress={() => handleDownload('best')}
                                    >
                                        <VideoIcon size={18} color={hasSelection ? onColor : Colors.textMuted} />
                                        <Text style={[styles.videoBatchBtnText, { color: hasSelection ? onColor : Colors.textMuted }]}>
                                            Download Video {hasSelection ? `(${selectedCount})` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        borderTopWidth: 1,
        borderColor: Colors.glassBorder,
        height: '84%',
        paddingTop: Spacing.sm,
    },
    grabber: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)',
        marginBottom: Spacing.md,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    coverShadow: {
        borderRadius: 16,
        backgroundColor: Colors.surfaceElevated,
    },
    coverClip: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.glassBorder,
    },
    coverEmpty: {
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    eyebrow: {
        ...Typography.scale.label,
        marginBottom: 3,
    },
    playlistTitle: {
        ...Typography.scale.title,
        fontSize: 21,
        lineHeight: 26,
        letterSpacing: -0.5,
        fontWeight: '800',
        color: Colors.textPrimary,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        flexWrap: 'wrap',
    },
    metaText: {
        ...Typography.scale.caption,
        color: Colors.textMuted,
    },
    metaDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: Colors.textMuted,
        marginHorizontal: 6,
    },
    metaSpinner: {
        transform: [{ scale: 0.6 }],
        marginRight: 2,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.glassFillStrong,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },

    // Search
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        height: 44,
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.xs,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        backgroundColor: Colors.glassFill,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 0,
        ...Typography.scale.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    searchClear: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyResults: {
        alignItems: 'center',
        paddingTop: Spacing.xxl,
        paddingHorizontal: Spacing.xl,
        gap: Spacing.sm,
    },
    emptyTitle: {
        ...Typography.scale.title,
        color: Colors.textPrimary,
    },
    emptyText: {
        ...Typography.scale.caption,
        color: Colors.textMuted,
        textAlign: 'center',
    },

    // Controls
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorder,
    },
    selectionControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BorderRadius.round,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        backgroundColor: Colors.glassFill,
    },
    chipText: {
        ...Typography.scale.caption,
        fontWeight: '700',
        color: Colors.textSecondary,
    },
    selectionSummary: {
        ...Typography.scale.caption,
        color: Colors.textMuted,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: Spacing.md,
        color: Colors.textMuted,
    },

    // Track list
    listContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.lg,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: ROW_HEIGHT,
        marginBottom: ROW_GAP,
        paddingHorizontal: 8,
        gap: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: 'transparent',
        backgroundColor: Colors.glassFill,
    },
    artImage: {
        backgroundColor: Colors.surfaceElevated,
    },
    artPlaceholder: {
        backgroundColor: Colors.surfaceElevated,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemInfo: {
        flex: 1,
        minWidth: 0,
    },
    itemTitle: {
        ...Typography.scale.body,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    itemAuthor: {
        ...Typography.scale.caption,
        color: Colors.textMuted,
        marginTop: 1,
    },
    itemDuration: {
        ...Typography.scale.caption,
        color: Colors.textMuted,
        fontVariant: ['tabular-nums'],
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Footer
    footer: {
        backgroundColor: Colors.surface,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        // Extra bottom padding so the button clears the Android navigation bar
        paddingBottom: Spacing.xl,
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorderLight,
        gap: Spacing.sm,
    },
    sectionLabel: {
        ...Typography.scale.label,
        color: Colors.textMuted,
    },
    footerRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    batchBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        gap: 2,
    },
    batchBtnTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    batchBtnText: {
        fontSize: 14,
        fontWeight: Typography.weights.bold,
        letterSpacing: -0.2,
    },
    batchBtnCaption: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    videoBatchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 52,
        borderRadius: BorderRadius.xl,
        gap: Spacing.sm,
        marginTop: 4,
    },
    videoBatchBtnText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        letterSpacing: -0.2,
    },

    // Story grid (Instagram / Facebook)
    gridContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.lg,
    },
    gridRow: {
        justifyContent: 'flex-start',
        gap: 8,
        marginBottom: 8,
    },
    storyGridItem: {
        width: '32%', // Approximate 1/3 of the width minus gap
        aspectRatio: 9 / 16,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
        backgroundColor: Colors.surfaceElevated,
    },
    storyThumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    storyGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    storyCheckbox: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    storyDurationContainer: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    storyDurationText: {
        color: '#FFF',
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
    },
});
