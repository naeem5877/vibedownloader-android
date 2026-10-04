/**
 * LibraryScreen - polished gallery of downloaded media.
 *
 * Two-column grid with kind/platform chips, search, sort, long-press multi-select,
 * and in-app preview for video & images.
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
    getPlatformIcon,
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
    normalizePlatform,
    SORT_LABELS,
    type KindFilter,
    type LibraryItem,
    type SortOrder,
} from '../utils/libraryMedia';

interface LibraryScreenProps {
    isFocused?: boolean;
}

const COLUMNS = 2;

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
    reddit: 'Reddit',
};

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ isFocused = true }) => {
    const gallery = useLibraryGallery();
    const { width } = useWindowDimensions();
    const [showSearch, setShowSearch] = useState(false);
    const [preview, setPreview] = useState<LibraryItem | null>(null);
    const [textViewer, setTextViewer] = useState<SubtitleViewerFile | null>(null);

    useEffect(() => {
        if (isFocused) gallery.reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused]);

    const gap = 10;
    const horizontalPad = 16;
    const tileWidth = Math.floor((width - horizontalPad * 2 - gap * (COLUMNS - 1)) / COLUMNS);

    const openItem = useCallback((item: LibraryItem) => {
        const kind = deriveMediaKind(item.extension);
        if (kind === 'text') {
            setTextViewer({
                path: item.path,
                name: item.name,
                platform: item.platform,
                size: item.size,
            });
            return;
        }
        if (!isPreviewable(kind)) {
            YtDlpNative.openFile?.(item.path);
            return;
        }
        setPreview(item);
    }, []);

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
        [gallery],
    );

    const handleBulkDelete = useCallback(() => {
        const count = gallery.selected.size;
        if (count === 0) return;
        Alert.alert(`Delete ${count} item${count === 1 ? '' : 's'}?`, 'This cannot be undone.', [
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
                            Haptics.error();
                            Alert.alert(
                                'Partly deleted',
                                `${result.deleted.length} deleted, ${result.failed.length} could not be removed.`,
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
        ]);
    }, [gallery]);

    const toggleSort = useCallback(() => {
        const next = SORT_CYCLE[(SORT_CYCLE.indexOf(gallery.filters.sort) + 1) % SORT_CYCLE.length];
        gallery.setSort(next);
        Haptics.selection();
    }, [gallery]);

    const platformLabel = useCallback((platform: string) => {
        const key = normalizePlatform(platform);
        return PLATFORM_LABELS[key] ?? platform;
    }, []);

    const renderTile = useCallback(
        ({ item }: { item: LibraryItem }) => {
            const kind = deriveMediaKind(item.extension);
            const platformKey = normalizePlatform(item.platform);
            const accent = getPlatformColor(platformKey || item.platform);
            const duration = formatTileDuration(item.duration);
            const poster = gallery.thumbnails[item.path] ?? item.thumbnail ?? null;
            const isSel = gallery.isSelected(item.path);
            const PlatformIcon = getPlatformIcon(platformKey);

            if (kind === 'video' && !poster) gallery.requestThumbnail(item.path);

            const KindIcon =
                kind === 'video'
                    ? VideoIcon
                    : kind === 'audio'
                      ? MusicNoteIcon
                      : kind === 'text'
                        ? TypeIcon
                        : ImageIcon;

            const displayName = item.name.replace(/\.[^.]+$/, '');
            const sizeLabel = item.size > 0 ? formatFileSize(item.size) : '—';

            const inSelection = gallery.selectionMode;

            return (
                <Pressable
                    onPress={() =>
                        inSelection ? gallery.toggleSelect(item.path) : openItem(item)
                    }
                    onLongPress={() => {
                        Haptics.impact();
                        gallery.toggleSelect(item.path);
                    }}
                    delayLongPress={280}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: isSel }}
                    style={[
                        styles.tile,
                        { width: tileWidth },
                        isSel && styles.tileSelected,
                        inSelection && !isSel && styles.tileDimmed,
                    ]}
                >
                    <View style={[styles.thumb, { backgroundColor: `${accent}18` }]}>
                        {poster ? (
                            <Image source={{ uri: poster }} style={styles.thumbImage} resizeMode="cover" />
                        ) : (
                            <View style={styles.placeholder}>
                                <View style={[styles.placeholderIcon, { backgroundColor: `${accent}22` }]}>
                                    <KindIcon size={22} color={accent} />
                                </View>
                            </View>
                        )}

                        <View style={styles.scrim} pointerEvents="none" />

                        {/* Soft tint when selected */}
                        {isSel && (
                            <View
                                style={[styles.selOverlay, { backgroundColor: `${accent}33` }]}
                                pointerEvents="none"
                            />
                        )}

                        {/* Platform badge — hide while selected so check is clear */}
                        {PlatformIcon && !isSel && (
                            <View style={[styles.platformBadge, { backgroundColor: `${accent}E6` }]}>
                                <PlatformIcon size={11} color="#FFF" />
                            </View>
                        )}

                        {duration && kind !== 'image' && !isSel && (
                            <View style={styles.durationBadge}>
                                <Text style={styles.durationText}>{duration}</Text>
                            </View>
                        )}

                        {kind === 'video' && poster && !isSel && (
                            <View style={styles.playDot} pointerEvents="none">
                                <PlayIcon size={11} color="#FFF" />
                            </View>
                        )}

                        {/* Selection checkbox — always visible in selection mode */}
                        {inSelection && (
                            <View
                                style={[
                                    styles.checkWrap,
                                    isSel
                                        ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
                                        : styles.checkEmpty,
                                ]}
                            >
                                {isSel && <CheckIcon size={13} color="#FFF" />}
                            </View>
                        )}
                    </View>

                    <View style={styles.tileBody}>
                        <Text style={styles.tileTitle} numberOfLines={2}>
                            {displayName}
                        </Text>
                        <View style={styles.tileMetaRow}>
                            <Text style={[styles.tilePlatform, { color: accent }]} numberOfLines={1}>
                                {platformLabel(item.platform)}
                            </Text>
                            <Text style={styles.tileDot}>·</Text>
                            <Text style={styles.tileMeta} numberOfLines={1}>
                                {sizeLabel}
                            </Text>
                        </View>
                    </View>
                </Pressable>
            );
        },
        [tileWidth, gallery, openItem, platformLabel],
    );

    const header = useMemo(
        () => (
            <View style={styles.filtersBlock}>
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
                            autoFocus
                        />
                        <Pressable
                            onPress={() => {
                                gallery.setQuery('');
                                setShowSearch(false);
                            }}
                            hitSlop={10}
                        >
                            <CloseIcon size={16} color={Colors.textMuted} />
                        </Pressable>
                    </View>
                )}

                {/* Kind filters */}
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
                                onPress={() => {
                                    gallery.setKind(key);
                                    Haptics.selection();
                                }}
                                style={[styles.chip, active && styles.chipActive]}
                            >
                                {Icon && (
                                    <Icon
                                        size={13}
                                        color={active ? '#FFF' : Colors.textSecondary}
                                    />
                                )}
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {label}
                                    {count > 0 ? ` ${count}` : ''}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {/* Platform filters */}
                {gallery.platforms.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        <Pressable
                            onPress={() => {
                                gallery.setPlatform(null);
                                Haptics.selection();
                            }}
                            style={[styles.chip, !gallery.filters.platform && styles.chipActive]}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    !gallery.filters.platform && styles.chipTextActive,
                                ]}
                            >
                                All platforms
                            </Text>
                        </Pressable>
                        {gallery.platforms.map((platform) => {
                            const active = gallery.filters.platform === platform;
                            const PlatformIcon = getPlatformIcon(platform);
                            const tint = getPlatformColor(platform);
                            return (
                                <Pressable
                                    key={platform}
                                    onPress={() => {
                                        gallery.setPlatform(active ? null : platform);
                                        Haptics.selection();
                                    }}
                                    style={[
                                        styles.chip,
                                        styles.platformChip,
                                        active && {
                                            backgroundColor: tint,
                                            borderColor: tint,
                                        },
                                    ]}
                                >
                                    {PlatformIcon && (
                                        <PlatformIcon
                                            size={13}
                                            color={active ? '#FFF' : tint}
                                        />
                                    )}
                                    <Text
                                        style={[
                                            styles.chipText,
                                            active && { color: '#FFF', fontWeight: '700' },
                                        ]}
                                    >
                                        {platformLabel(platform)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                <View style={styles.statusRow}>
                    <Text style={styles.statusText}>
                        {gallery.visible.length} item{gallery.visible.length === 1 ? '' : 's'}
                        {gallery.hasActiveFilters ? ' · filtered' : ''}
                    </Text>
                    <Pressable onPress={toggleSort} hitSlop={8} style={styles.sortBtn}>
                        <Text style={styles.sortText}>{SORT_LABELS[gallery.filters.sort]}</Text>
                    </Pressable>
                </View>
            </View>
        ),
        [showSearch, gallery, toggleSort, platformLabel],
    );

    const empty = gallery.loading ? null : gallery.error ? (
        <EmptyState
            icon={<RefreshIcon size={44} color={Colors.textMuted} />}
            title="Library unavailable"
            subtitle={gallery.error}
        />
    ) : gallery.items.length === 0 ? (
        <EmptyState
            icon={<ImageIcon size={44} color={Colors.textMuted} />}
            title="Nothing here yet"
            subtitle="Downloads you make will appear here"
        />
    ) : (
        <EmptyState
            icon={<SearchIcon size={44} color={Colors.textMuted} />}
            title="No matches"
            subtitle="Try a different filter"
        />
    );

    return (
        <SafeAreaView style={styles.root} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

            {gallery.selectionMode ? (
                <View style={styles.selHeader}>
                    <Pressable onPress={gallery.clearSelection} hitSlop={12} style={styles.selHeaderBtn}>
                        <CloseIcon size={18} color={Colors.textPrimary} />
                    </Pressable>
                    <View style={styles.selHeaderCenter}>
                        <Text style={styles.selHeaderCount}>{gallery.selected.size}</Text>
                        <Text style={styles.selHeaderLabel}>
                            {gallery.selected.size === 1 ? 'item selected' : 'items selected'}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable onPress={gallery.selectAll} hitSlop={12} style={styles.selHeaderBtn}>
                            <Text style={styles.selectAllText}>All</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleBulkDelete}
                            hitSlop={12}
                            disabled={gallery.deleting || gallery.selected.size === 0}
                            style={[
                                styles.selDeleteBtn,
                                (gallery.deleting || gallery.selected.size === 0) && styles.iconBtnDisabled,
                            ]}
                        >
                            <TrashIcon size={17} color="#FFF" />
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={styles.header}>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.headerTitle}>Library</Text>
                        <Text style={styles.headerSub}>
                            {gallery.items.length} download{gallery.items.length === 1 ? '' : 's'}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            onPress={() => setShowSearch((s) => !s)}
                            hitSlop={12}
                            style={[styles.iconBtn, showSearch && styles.iconBtnActive]}
                        >
                            <SearchIcon
                                size={18}
                                color={showSearch ? Colors.primary : Colors.textPrimary}
                            />
                        </Pressable>
                        <Pressable
                            onPress={() => {
                                gallery.reload();
                                Haptics.impact();
                            }}
                            hitSlop={12}
                            style={styles.iconBtn}
                        >
                            <RefreshIcon size={18} color={Colors.textPrimary} />
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

            {textViewer && (
                <SubtitleViewerModal file={textViewer} onClose={() => setTextViewer(null)} />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 10,
    },
    headerTextWrap: { flex: 1 },
    headerTitle: {
        color: Colors.textPrimary,
        fontSize: 28,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    headerSub: {
        color: Colors.textMuted,
        fontSize: 12,
        marginTop: 2,
        fontWeight: '500',
    },
    headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    iconBtnActive: {
        borderColor: `${Colors.primary}55`,
        backgroundColor: `${Colors.primary}18`,
    },
    iconBtnDisabled: { opacity: 0.4 },
    selectAllText: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '700',
    },

    /* Selection mode top bar */
    selHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 10,
        gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.innerBorder,
        backgroundColor: Colors.surfaceLow,
    },
    selHeaderBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    selHeaderCenter: {
        flex: 1,
    },
    selHeaderCount: {
        color: Colors.textPrimary,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    selHeaderLabel: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
        marginTop: 1,
    },
    selDeleteBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.error,
    },

    filtersBlock: {
        paddingBottom: 4,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 10,
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 14,
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    searchInput: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: 15,
        padding: 0,
    },

    chipRow: {
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 5,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    chipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    chipText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    chipTextActive: {
        color: '#FFF',
        fontWeight: '700',
    },
    platformChip: {
        paddingLeft: 10,
    },

    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 6,
    },
    statusText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
    },
    sortBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    sortText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '700',
    },

    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    row: {
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 10,
    },

    tile: {
        borderRadius: 16,
        backgroundColor: Colors.surfaceMedium,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        overflow: 'hidden',
    },
    tileSelected: {
        borderColor: Colors.primary,
        borderWidth: 2,
        backgroundColor: `${Colors.primary}12`,
    },
    tileDimmed: {
        opacity: 0.45,
    },
    thumb: {
        width: '100%',
        aspectRatio: 1.35,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbImage: { width: '100%', height: '100%' },
    placeholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrim: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '40%',
        backgroundColor: 'rgba(0,0,0,0.28)',
    },
    selOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    platformBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    durationBadge: {
        position: 'absolute',
        right: 8,
        bottom: 8,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    durationText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    playDot: {
        position: 'absolute',
        left: 8,
        bottom: 8,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    checkWrap: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        zIndex: 5,
    },
    checkEmpty: {
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderColor: 'rgba(255,255,255,0.55)',
    },

    tileBody: {
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
    },
    tileTitle: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
        lineHeight: 17,
    },
    tileMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    tilePlatform: {
        fontSize: 11,
        fontWeight: '700',
        flexShrink: 1,
    },
    tileDot: {
        color: Colors.textMuted,
        fontSize: 11,
    },
    tileMeta: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
        flexShrink: 0,
    },
});

export default LibraryScreen;
