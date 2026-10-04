/**
 * LibraryScreen - a photo-style gallery of everything downloaded.
 *
 * Flat newest-first grid with filter chips, long-press multi-select for bulk
 * delete, and in-app preview for video and images.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius, getPlatformColor } from '../theme';
import {
    CheckIcon,
    CloseIcon,
    ImageIcon,
    MusicNoteIcon,
    PlayIcon,
    RefreshIcon,
    SearchIcon,
    TrashIcon,
    TypeIcon,
    VideoIcon,
} from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { MediaPreviewModal } from '../components/MediaPreviewModal';
import SubtitleViewerModal, { type SubtitleViewerFile } from '../components/SubtitleViewerModal';
import { useLibraryGallery } from '../hooks/useLibraryGallery';
import { YtDlpNative, formatFileSize } from '../native/YtDlpModule';
import { Haptics } from '../utils/haptics';
import {
    deriveMediaKind,
    formatTileDuration,
    isPreviewable,
    SORT_LABELS,
    type KindFilter,
    type LibraryItem,
    type SortOrder,
} from '../utils/libraryMedia';

interface LibraryScreenProps {
    isFocused?: boolean;
}

/** Tiles per row. 3 matches Google Photos and keeps titles readable. */
const COLUMNS = 3;

const KIND_FILTERS: {
    key: KindFilter;
    label: string;
    Icon: React.FC<{ size?: number; color?: string }> | null;
}[] = [
    { key: 'all', label: 'All', Icon: null },
    { key: 'video', label: 'Videos', Icon: VideoIcon },
    { key: 'image', label: 'Images', Icon: ImageIcon },
    { key: 'audio', label: 'Audio', Icon: MusicNoteIcon },
    { key: 'text', label: 'Text', Icon: TypeIcon },
];

const SORT_CYCLE: SortOrder[] = ['newest', 'oldest', 'largest', 'name'];

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ isFocused = true }) => {
    const gallery = useLibraryGallery();
    const { width } = useWindowDimensions();
    const [showSearch, setShowSearch] = useState(false);
    const [preview, setPreview] = useState<LibraryItem | null>(null);
    const [textViewer, setTextViewer] = useState<SubtitleViewerFile | null>(null);

    // Pull the library when the tab becomes active, matching the old
    // focus-driven reload so downloads that finished in the background appear.
    useEffect(() => {
        if (isFocused) gallery.reload();
        // Intentionally keyed on focus only: reloading on every filter change
        // would restart the listing and undo the user's selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused]);

    const gap = Spacing.xs;
    // Subtract the screen padding and inter-tile gaps before dividing, otherwise
    // the last column overflows by the accumulated gap width.
    const tileWidth = Math.floor((width - Spacing.md * 2 - gap * (COLUMNS - 1)) / COLUMNS);

    const openItem = useCallback(
        (item: LibraryItem) => {
            const kind = deriveMediaKind(item.extension);
            if (kind === 'text') {
                // Text sidecars have no external app that claims them, so they
                // always open in the in-app viewer.
                setTextViewer({
                    path: item.path,
                    name: item.name,
                    platform: item.platform,
                    size: item.size,
                });
                return;
            }
            if (!isPreviewable(kind)) {
                // Audio has no inline stage, so fall back to the system player.
                YtDlpNative.openFile?.(item.path);
                return;
            }
            setPreview(item);
        },
        []
    );

    const handleDeleteOne = useCallback(
        async (item: LibraryItem) => {
            Alert.alert('Delete?', item.name, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        Haptics.impact();
                        const ok = await YtDlpNative.deleteFile?.(item.path);
                        if (ok) {
                            Haptics.success();
                            gallery.reload();
                        } else {
                            Haptics.error();
                            Alert.alert('Could not delete', 'The file is still there.');
                        }
                    },
                },
            ]);
        },
        [gallery]
    );

    const handleBulkDelete = useCallback(() => {
        const count = gallery.selected.size;
        if (count === 0) return;
        Alert.alert(
            `Delete ${count} item${count === 1 ? '' : 's'}?`,
            'This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        Haptics.impact();
                        try {
                            const result = await gallery.deleteSelected();
                            if (!result) return;
                            if (result.failed.length > 0) {
                                // Name the survivors rather than implying the
                                // whole batch succeeded.
                                Haptics.error();
                                Alert.alert(
                                    'Partly deleted',
                                    `${result.deleted.length} deleted, ${result.failed.length} could not be removed.`
                                );
                            } else {
                                Haptics.success();
                            }
                            setPreview(null);
                        } catch (e) {
                            Haptics.error();
                            Alert.alert('Delete failed', e instanceof Error ? e.message : undefined);
                        }
                    },
                },
            ]
        );
    }, [gallery]);

    const toggleSort = useCallback(() => {
        const next = SORT_CYCLE[(SORT_CYCLE.indexOf(gallery.filters.sort) + 1) % SORT_CYCLE.length];
        gallery.setSort(next);
        Haptics.selection();
    }, [gallery]);

    const renderTile = useCallback(
        ({ item }: { item: LibraryItem }) => {
            const kind = deriveMediaKind(item.extension);
            const accent = getPlatformColor(item.platform);
            const duration = formatTileDuration(item.duration);
            const poster = gallery.thumbnails[item.path] ?? item.thumbnail ?? null;
            const isSel = gallery.isSelected(item.path);

            // Only videos need a generated poster; images and audio already have
            // a real thumbnail or artwork from the listing.
            if (kind === 'video' && !poster) gallery.requestThumbnail(item.path);

            const KindIcon =
                kind === 'video' ? VideoIcon : kind === 'audio' ? MusicNoteIcon : kind === 'text' ? TypeIcon : ImageIcon;

            return (
                <Pressable
                    onPress={() => (gallery.selectionMode ? gallery.toggleSelect(item.path) : openItem(item))}
                    onLongPress={() => {
                        Haptics.impact();
                        gallery.toggleSelect(item.path);
                    }}
                    delayLongPress={280}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: isSel }}
                    style={[styles.tile, { width: tileWidth }]}
                >
                    <View style={[styles.thumb, { backgroundColor: `${accent}1A` }]}>
                        {poster ? (
                            <Image source={{ uri: poster }} style={styles.thumbImage} resizeMode="cover" />
                        ) : (
                            <KindIcon size={30} color={accent} />
                        )}

                        {/* Scrim keeps the duration and selection ring legible over
                            a bright frame. */}
                        <View style={styles.scrim} pointerEvents="none" />

                        {duration && kind !== 'image' && (
                            <View style={styles.durationBadge}>
                                <Text style={styles.durationText}>{duration}</Text>
                            </View>
                        )}

                        {kind === 'video' && poster && (
                            <View style={styles.playDot} pointerEvents="none">
                                <PlayIcon size={12} color="#FFF" />
                            </View>
                        )}

                        {isSel && (
                            <View style={[styles.selRing, { borderColor: accent }]}>
                                <View style={[styles.selDot, { backgroundColor: accent }]}>
                                    <CheckIcon size={13} color="#FFF" />
                                </View>
                            </View>
                        )}
                    </View>

                    <Text style={styles.tileTitle} numberOfLines={1}>
                        {item.name.replace(/\.[^.]+$/, '')}
                    </Text>
                    <Text style={styles.tileMeta} numberOfLines={1}>
                        {formatFileSize(item.size)}
                    </Text>
                </Pressable>
            );
        },
        [tileWidth, gallery, openItem]
    );

    const header = useMemo(
        () => (
            <View>
                {/* Search field, revealed by the magnifier rather than always
                    taking vertical space from the grid. */}
                {showSearch && (
                    <View style={styles.searchRow}>
                        <SearchIcon size={16} color={Colors.textMuted} />
                        <TextInput
                            value={gallery.filters.query}
                            onChangeText={gallery.setQuery}
                            placeholder="Search downloads"
                            placeholderTextColor={Colors.textMuted}
                            style={styles.searchInput}
                            autoCorrect={false}
                            autoCapitalize="none"
                            returnKeyType="search"
                        />
                        <Pressable onPress={() => { gallery.setQuery(''); setShowSearch(false); }} hitSlop={10}>
                            <CloseIcon size={16} color={Colors.textMuted} />
                        </Pressable>
                    </View>
                )}

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                >
                    {KIND_FILTERS.map(({ key, label, Icon }) => {
                        const active = gallery.filters.kind === key;
                        const count = gallery.kindCounts[key];
                        return (
                            <Pressable
                                key={key}
                                onPress={() => { gallery.setKind(key); Haptics.selection(); }}
                                style={[styles.chip, active && styles.chipActive]}
                            >
                                {Icon && (
                                    <Icon size={13} color={active ? Colors.background : Colors.textSecondary} />
                                )}
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {label}
                                    {count > 0 ? ` ${count}` : ''}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {gallery.platforms.length > 1 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        <Pressable
                            onPress={() => { gallery.setPlatform(null); Haptics.selection(); }}
                            style={[styles.chip, !gallery.filters.platform && styles.chipActive]}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    !gallery.filters.platform && styles.chipTextActive,
                                ]}
                            >
                                Every platform
                            </Text>
                        </Pressable>
                        {gallery.platforms.map((platform) => {
                            const active = gallery.filters.platform === platform;
                            return (
                                <Pressable
                                    key={platform}
                                    onPress={() => {
                                        gallery.setPlatform(active ? null : platform);
                                        Haptics.selection();
                                    }}
                                    style={[
                                        styles.chip,
                                        active && { backgroundColor: getPlatformColor(platform), borderColor: getPlatformColor(platform) },
                                    ]}
                                >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {platform}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                <View style={styles.statusRow}>
                    <Text style={styles.statusText}>
                        {gallery.visible.length} item{gallery.visible.length === 1 ? '' : 's'}
                        {gallery.hasActiveFilters ? ' filtered' : ''}
                    </Text>
                    <Pressable onPress={toggleSort} hitSlop={8} style={styles.sortBtn}>
                        <Text style={styles.sortText}>{SORT_LABELS[gallery.filters.sort]}</Text>
                    </Pressable>
                </View>
            </View>
        ),
        [showSearch, gallery, toggleSort]
    );

    const empty = gallery.loading ? null : gallery.error ? (
        <EmptyState icon={<RefreshIcon size={44} color={Colors.textMuted} />} title="Library unavailable" subtitle={gallery.error} />
    ) : gallery.items.length === 0 ? (
        <EmptyState icon={<ImageIcon size={44} color={Colors.textMuted} />} title="Nothing here yet" subtitle="Downloads you make will appear here" />
    ) : (
        <EmptyState icon={<SearchIcon size={44} color={Colors.textMuted} />} title="No matches" subtitle="Try a different filter" />
    );

    return (
        <SafeAreaView style={styles.root} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

            {/* The header swaps to a selection bar so the bulk action always has
                a home and never covers the grid. */}
            {gallery.selectionMode ? (
                <View style={styles.header}>
                    <Pressable onPress={gallery.clearSelection} hitSlop={12} style={styles.iconBtn}>
                        <CloseIcon size={22} color={Colors.textPrimary} />
                    </Pressable>
                    <Text style={styles.headerTitle}>{gallery.selected.size} selected</Text>
                    <View style={styles.headerActions}>
                        <Pressable onPress={gallery.selectAll} hitSlop={12} style={styles.iconBtn}>
                            <Text style={styles.selectAllText}>All</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleBulkDelete}
                            hitSlop={12}
                            disabled={gallery.deleting}
                            style={[styles.iconBtn, gallery.deleting && styles.iconBtnDisabled]}
                        >
                            <TrashIcon size={20} color={Colors.errorLight} />
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={styles.header}>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.headerTitle}>Library</Text>
                        <Text style={styles.headerSub}>{gallery.items.length} downloads</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable onPress={() => setShowSearch((s) => !s)} hitSlop={12} style={styles.iconBtn}>
                            <SearchIcon size={20} color={Colors.textPrimary} />
                        </Pressable>
                        <Pressable onPress={() => { gallery.reload(); Haptics.impact(); }} hitSlop={12} style={styles.iconBtn}>
                            <RefreshIcon size={20} color={Colors.textPrimary} />
                        </Pressable>
                    </View>
                </View>
            )}

            <FlatList
                key={`grid-${tileWidth}`}
                data={gallery.visible}
                keyExtractor={(item) => item.path}
                renderItem={renderTile}
                numColumns={COLUMNS}
                ListHeaderComponent={header}
                ListEmptyComponent={empty}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={gallery.refreshing}
                        onRefresh={() => gallery.reload()}
                        tintColor={Colors.textMuted}
                        colors={[Colors.primary]}
                    />
                }
                removeClippedSubviews
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={7}
            />

            <MediaPreviewModal
                item={preview}
                onClose={() => setPreview(null)}
                onDelete={
                    preview
                        ? () => {
                              const target = preview;
                              setPreview(null);
                              handleDeleteOne(target);
                          }
                        : undefined
                }
            />

            {textViewer && <SubtitleViewerModal file={textViewer} onClose={() => setTextViewer(null)} />}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    headerTextWrap: { flex: 1 },
    headerTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xl,
        fontWeight: Typography.weights.bold,
    },
    headerSub: { color: Colors.textMuted, fontSize: Typography.sizes.xs, marginTop: 1 },
    headerActions: { flexDirection: 'row', gap: Spacing.xs, alignItems: 'center' },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
    },
    iconBtnDisabled: { opacity: 0.4 },
    selectAllText: {
        color: Colors.primary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.md,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sizes.base, padding: 0 },
    chipRow: { gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.medium,
    },
    chipTextActive: { color: Colors.background, fontWeight: Typography.weights.semibold },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
    },
    statusText: { color: Colors.textMuted, fontSize: Typography.sizes.xs },
    sortBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surface,
    },
    sortText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.semibold,
    },
    listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
    row: { gap: Spacing.xs },
    tile: { marginBottom: Spacing.xs },
    thumb: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbImage: { width: '100%', height: '100%' },
    scrim: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '38%',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    durationBadge: {
        position: 'absolute',
        right: 4,
        bottom: 4,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: 'rgba(0,0,0,0.65)',
    },
    durationText: {
        color: '#FFF',
        fontSize: Typography.sizes.xxs,
        fontWeight: Typography.weights.semibold,
        fontVariant: ['tabular-nums'],
    },
    playDot: {
        position: 'absolute',
        left: 4,
        bottom: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    selRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: BorderRadius.md,
        borderWidth: 2.5,
    },
    selDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tileTitle: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xs,
        marginTop: Spacing.xs,
        fontWeight: Typography.weights.medium,
    },
    tileMeta: { color: Colors.textMuted, fontSize: Typography.sizes.xxs },
});

export default LibraryScreen;