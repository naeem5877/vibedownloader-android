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
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  getPlatformColor,
} from '../theme';
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
import { BottomFade } from '../components/BottomFade';
import SubtitleViewerModal, {
  type SubtitleViewerFile,
} from '../components/SubtitleViewerModal';
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

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  isFocused = true,
}) => {
  const gallery = useLibraryGallery();
  const { width } = useWindowDimensions();
  const [showSearch, setShowSearch] = useState(false);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [textViewer, setTextViewer] = useState<SubtitleViewerFile | null>(null);

  // Re-scan when the tab becomes active. `reload` is already fire-and-forget
  // and the gallery keeps showing the previous listing until the new one
  // lands, so this never blanks the grid on the way in. Finished downloads
  // also arrive through the library-changed signal, so by the time the app
  // slides over here the new row is usually already in place.
  useEffect(() => {
    if (isFocused) gallery.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const gap = 10;
  const horizontalPad = 16;
  const tileWidth = Math.floor(
    (width - horizontalPad * 2 - gap * (COLUMNS - 1)) / COLUMNS,
  );

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
              Alert.alert(
                'Delete failed',
                e instanceof Error ? e.message : undefined,
              );
            }
          },
        },
      ],
    );
  }, [gallery]);

  const toggleSort = useCallback(() => {
    const next =
      SORT_CYCLE[
        (SORT_CYCLE.indexOf(gallery.filters.sort) + 1) % SORT_CYCLE.length
      ];
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

      // Video gets a decoded poster frame, audio gets the artwork already
      // embedded in the file, so ask for both. Native falls back to the
      // legacy sidecar .jpg when the file itself has no art, which keeps
      // older downloads showing their cover.
      if (kind !== 'text' && !poster) gallery.requestThumbnail(item.path);

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
          {/* Full-bleed media */}
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[styles.placeholder, { backgroundColor: `${accent}22` }]}
            >
              <KindIcon size={28} color={accent} />
            </View>
          )}

          {/* Smooth bottom fade for text legibility */}
          <BottomFade />

          {isSel && (
            <View
              style={[
                styles.selOverlay,
                { backgroundColor: `${Colors.primary}40` },
              ]}
              pointerEvents="none"
            />
          )}

          {/* Top row: platform + duration / check */}
          <View style={styles.topRow} pointerEvents="none">
            {PlatformIcon && !isSel ? (
              <View
                style={[
                  styles.platformBadge,
                  { backgroundColor: 'rgba(0,0,0,0.45)' },
                ]}
              >
                <PlatformIcon size={12} color="#FFF" />
              </View>
            ) : (
              <View />
            )}
            {inSelection ? (
              <View
                style={[
                  styles.checkWrap,
                  isSel
                    ? {
                        backgroundColor: Colors.primary,
                        borderColor: Colors.primary,
                      }
                    : styles.checkEmpty,
                ]}
              >
                {isSel && <CheckIcon size={13} color="#FFF" />}
              </View>
            ) : duration && kind !== 'image' ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{duration}</Text>
              </View>
            ) : null}
          </View>

          {/* Play hint for videos with poster */}
          {kind === 'video' && poster && !isSel && !inSelection && (
            <View style={styles.playWrap} pointerEvents="none">
              <View style={styles.playDot}>
                <PlayIcon size={12} color="#FFF" />
              </View>
            </View>
          )}

          {/* Title + meta overlaid on the fade */}
          <View style={styles.overlayBody}>
            <Text style={styles.tileTitle} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={styles.tileMeta} numberOfLines={1}>
              {platformLabel(item.platform)}
              {sizeLabel !== '—' ? `  ·  ${sizeLabel}` : ''}
            </Text>
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

        {/* Kind filters – segmented control */}
        <View style={styles.segment}>
          {KIND_FILTERS.map(({ key, label }) => {
            const active = gallery.filters.kind === key;
            const count = gallery.kindCounts[key];
            return (
              <Pressable
                key={key}
                onPress={() => {
                  gallery.setKind(key);
                  Haptics.selection();
                }}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    active && styles.segmentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {active && count > 0 && (
                  <Text style={styles.segmentCount}>{count}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Platform filters */}
        {gallery.platforms.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pRowScroll}
            contentContainerStyle={styles.pRow}
          >
            <Pressable
              onPress={() => {
                gallery.setPlatform(null);
                Haptics.selection();
              }}
              style={[
                styles.pChip,
                !gallery.filters.platform && styles.pChipActive,
              ]}
            >
              <Text
                style={[
                  styles.pChipText,
                  !gallery.filters.platform && styles.pChipTextActive,
                ]}
              >
                All platforms
              </Text>
            </Pressable>
            {gallery.platforms.map(platform => {
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
                    styles.pChip,
                    active && {
                      backgroundColor: `${tint}26`,
                      borderColor: `${tint}66`,
                    },
                  ]}
                >
                  {PlatformIcon && <PlatformIcon size={12} color={tint} />}
                  <Text
                    style={[
                      styles.pChipText,
                      active && {
                        color: Colors.textPrimary,
                        fontWeight: '700',
                      },
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
            {gallery.visible.length} item
            {gallery.visible.length === 1 ? '' : 's'}
            {gallery.hasActiveFilters ? ' · filtered' : ''}
          </Text>
          <Pressable onPress={toggleSort} hitSlop={8} style={styles.sortBtn}>
            <Text style={styles.sortText}>
              {SORT_LABELS[gallery.filters.sort]}
            </Text>
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
          <Pressable
            onPress={gallery.clearSelection}
            hitSlop={12}
            style={styles.selHeaderBtn}
          >
            <CloseIcon size={18} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.selHeaderCenter}>
            <Text style={styles.selHeaderCount}>{gallery.selected.size}</Text>
            <Text style={styles.selHeaderLabel}>
              {gallery.selected.size === 1 ? 'item selected' : 'items selected'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={gallery.selectAll}
              hitSlop={12}
              style={styles.selHeaderBtn}
            >
              <Text style={styles.selectAllText}>All</Text>
            </Pressable>
            <Pressable
              onPress={handleBulkDelete}
              hitSlop={12}
              disabled={gallery.deleting || gallery.selected.size === 0}
              style={[
                styles.selDeleteBtn,
                (gallery.deleting || gallery.selected.size === 0) &&
                  styles.iconBtnDisabled,
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
              {gallery.items.length} download
              {gallery.items.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setShowSearch(s => !s)}
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
        keyExtractor={item => item.path}
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

      {preview ? (
        <MediaPreviewModal
          item={preview}
          onClose={() => setPreview(null)}
          onDelete={() => {
            const target = preview;
            setPreview(null);
            handleDeleteOne(target);
          }}
        />
      ) : null}

      {textViewer && (
        <SubtitleViewerModal
          file={textViewer}
          onClose={() => setTextViewer(null)}
        />
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
    paddingTop: 4,
    paddingBottom: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
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

  /* Kind filter – segmented control */
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMedium,
    borderWidth: 1,
    borderColor: Colors.innerBorder,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 34,
    borderRadius: 10,
  },
  segmentItemActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  segmentCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Platform filter – light chips that bleed to the screen edges */
  pRowScroll: {
    marginHorizontal: -16,
    marginTop: 12,
  },
  pRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  pChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.innerBorder,
  },
  pChipActive: {
    backgroundColor: `${Colors.primary}26`,
    borderColor: `${Colors.primary}66`,
  },
  pChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  pChipTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 10,
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
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceMedium,
    aspectRatio: 0.85,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tileSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  tileDimmed: {
    opacity: 0.4,
  },
  thumbImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 4,
  },
  platformBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  durationBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  durationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    paddingBottom: 20,
  },
  playDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  checkWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  checkEmpty: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  overlayBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 28,
    zIndex: 3,
  },
  tileTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tileMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.1,
  },
});

export default LibraryScreen;
