import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  Shadows,
  getPlatformColor,
} from '../theme';
import {
  CloseIcon,
  ClipboardIcon,
  LayersIcon,
  RefreshIcon,
  InfoIcon,
  CheckIcon,
} from './Icons';
import { parseBatchUrls, detectPlatform } from '../utils/batchUrls';
import { YtDlpNative } from '../native/YtDlpModule';
import { CookieManagerService } from '../services/CookieManagerService';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';

export interface BatchResolvedItem {
  title: string;
  author: string;
  url: string;
  type: string;
  thumbnail?: string;
  cookies?: string;
  /** Player client that produced this item's format ids, so the download matches. */
  playerClient?: string;
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

/** `https://www.youtube.com/watch?v=abc` -> `youtube.com/watch?v=abc` for compact rows. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '');
}

/** Colour for a platform dot. X is white, which is fine as a small dot on a dark row. */
function dotColor(platform: string): string {
  return platform === 'other' || platform === 'reddit'
    ? Colors.textMuted
    : getPlatformColor(platform);
}

export const BatchDownloadSheet: React.FC<BatchDownloadSheetProps> = ({
  visible,
  onClose,
  onStart,
}) => {
  const [raw, setRaw] = useState('');
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  // Lets Stop / close abort the lookup loop between links.
  const cancelledRef = useRef(false);

  const parsed = useMemo(() => parseBatchUrls(raw), [raw]);
  const { urls, duplicates, rejected, platforms } = parsed;

  const tooMany = urls.length > MAX_ITEMS;
  const canStart = urls.length > 0 && !tooMany && !resolving;

  // This sheet sits in a Modal inside the Download <-> Library swipe area, so
  // sideways drags in here must not slide the screen behind it.
  useEffect(() => {
    if (!visible) return;
    return acquireTabSwipeLock();
  }, [visible]);

  const reset = useCallback(() => {
    setRaw('');
    setError(null);
    setResolving(false);
    setProgress({ done: 0, total: 0 });
  }, []);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    reset();
    onClose();
  }, [reset, onClose]);

  /** Adds to what is already there: batch lists are built up in several pastes. */
  const handlePaste = useCallback(async () => {
    try {
      const text = (await YtDlpNative.getClipboardText())?.trim();
      if (!text) {
        setError('Your clipboard is empty.');
        return;
      }
      setError(null);
      setRaw(prev =>
        prev.trim() ? `${prev.replace(/\s+$/, '')}\n${text}` : text,
      );
    } catch {
      setError('Could not read the clipboard.');
    }
  }, []);

  const handleClear = useCallback(() => {
    setRaw('');
    setError(null);
  }, []);

  /** Drops one link from the list. Rebuilds the text from the cleaned list. */
  const removeUrl = useCallback(
    (url: string) => {
      setRaw(urls.filter(u => u !== url).join('\n'));
    },
    [urls],
  );

  const handleStop = useCallback(() => {
    cancelledRef.current = true;
    setResolving(false);
    setProgress({ done: 0, total: 0 });
  }, []);

  /**
   * Resolves each pasted link to a title before it enters the queue, so rows
   * show something meaningful instead of a raw url. A link that cannot be
   * resolved is dropped with a reason rather than failing later inside the
   * queue, where the user has no way to tell which one broke.
   */
  const handleStart = useCallback(async () => {
    if (!canStart) return;
    cancelledRef.current = false;
    setResolving(true);
    setError(null);
    setProgress({ done: 0, total: urls.length });

    const items: BatchResolvedItem[] = [];
    const failures: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      if (cancelledRef.current) return;
      const url = urls[i];
      try {
        // Cookies must be looked up per url, otherwise a paste mixing
        // YouTube and Instagram would share the wrong cookie jar.
        const platform = detectPlatform(url);
        const cookies =
          platform !== 'other'
            ? await CookieManagerService.getCookiesForPlatform(platform).catch(
                () => null,
              )
            : null;

        const info = await YtDlpNative.fetchInfo(url, {
          cookies: cookies || undefined,
        });
        items.push({
          title: info.title || 'Unknown title',
          author: info.uploader || '',
          url,
          type: detectTypeFromUrl(url),
          thumbnail: info.thumbnail,
          cookies: cookies || undefined,
          playerClient: info.playerClient || undefined,
        });
      } catch {
        failures.push(url);
      }
      if (!cancelledRef.current)
        setProgress({ done: i + 1, total: urls.length });
    }

    if (cancelledRef.current) return;
    setResolving(false);

    if (items.length === 0) {
      setError(
        'None of those links could be read. Check they are public and correct.',
      );
      return;
    }

    onStart(items, null);

    if (failures.length > 0) {
      setError(
        `Skipped ${failures.length} link${
          failures.length > 1 ? 's' : ''
        } that could not be read.`,
      );
    }
    reset();
  }, [canStart, urls, onStart, reset]);

  const platformEntries = Object.entries(platforms) as [string, number][];
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={resolving ? undefined : handleClose}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <LayersIcon size={18} color={Colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Batch Download</Text>
              <Text style={styles.subtitle}>
                {resolving
                  ? `Reading link ${Math.min(
                      progress.done + 1,
                      progress.total,
                    )} of ${progress.total}\u2026`
                  : urls.length > 0
                  ? `${urls.length} link${
                      urls.length > 1 ? 's' : ''
                    } ready to queue`
                  : 'Paste links, one per line'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              accessibilityLabel="Close"
            >
              <CloseIcon size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Input card */}
            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                value={raw}
                onChangeText={setRaw}
                placeholder={
                  'https://youtube.com/watch?v=...\nhttps://instagram.com/reel/...\nhttps://x.com/.../status/...'
                }
                placeholderTextColor={Colors.textMuted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textAlignVertical="top"
                editable={!resolving}
              />
              <View style={styles.inputBar}>
                <Text style={[styles.counter, tooMany && styles.counterOver]}>
                  {urls.length}/{MAX_ITEMS} links
                </Text>
                <View style={styles.inputActions}>
                  {raw.length > 0 && !resolving && (
                    <TouchableOpacity
                      style={styles.ghostBtn}
                      onPress={handleClear}
                    >
                      <Text style={styles.ghostText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.pasteBtn}
                    onPress={handlePaste}
                    disabled={resolving}
                  >
                    <ClipboardIcon size={14} color={Colors.primary} />
                    <Text style={styles.pasteText}>
                      {raw.trim() ? 'Paste more' : 'Paste'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Empty state: what is supported, so the sheet is not a blank box */}
            {urls.length === 0 && (
              <View style={styles.hintBox}>
                <InfoIcon size={14} color={Colors.textMuted} />
                <Text style={styles.hintText}>
                  Works with YouTube, Instagram, TikTok, Facebook, X and Spotify
                  links. Paste up to {MAX_ITEMS} at once, duplicates are removed
                  for you.
                </Text>
              </View>
            )}

            {/* Platform summary */}
            {urls.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chips}
                contentContainerStyle={styles.chipsContent}
                keyboardShouldPersistTaps="handled"
              >
                {platformEntries.map(([name, count]) => (
                  <View key={name} style={styles.chip}>
                    <View
                      style={[
                        styles.chipDot,
                        { backgroundColor: dotColor(name) },
                      ]}
                    />
                    <Text style={styles.chipCount}>{count}</Text>
                    <Text style={styles.chipText}>
                      {PLATFORM_LABELS[name] ?? name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Link list */}
            {urls.length > 0 && (
              <View style={styles.list}>
                <ScrollView
                  style={styles.listScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {urls.map((url, index) => {
                    const platform = detectPlatform(url);
                    return (
                      <View
                        key={`${url}-${index}`}
                        style={[
                          styles.row,
                          index === urls.length - 1 && styles.rowLast,
                        ]}
                      >
                        <Text style={styles.rowIndex}>{index + 1}</Text>
                        <View
                          style={[
                            styles.rowDot,
                            { backgroundColor: dotColor(platform) },
                          ]}
                        />
                        <Text
                          style={styles.rowUrl}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {shortUrl(url)}
                        </Text>
                        {!resolving && (
                          <TouchableOpacity
                            style={styles.rowRemove}
                            onPress={() => removeUrl(url)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Remove link"
                          >
                            <CloseIcon size={14} color={Colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Notes */}
            {urls.length > 0 && !resolving && (
              <View style={styles.notes}>
                {duplicates.length > 0 && (
                  <View style={styles.noteRow}>
                    <RefreshIcon size={12} color={Colors.textMuted} />
                    <Text style={styles.noteText}>
                      {duplicates.length} duplicate
                      {duplicates.length > 1 ? 's' : ''} removed
                    </Text>
                  </View>
                )}
                {rejected.length > 0 && (
                  <View style={styles.noteRow}>
                    <InfoIcon size={12} color={Colors.warning} />
                    <Text style={[styles.noteText, { color: Colors.warning }]}>
                      {rejected.length} line{rejected.length > 1 ? 's' : ''}{' '}
                      skipped (not a link)
                    </Text>
                  </View>
                )}
                {duplicates.length === 0 &&
                  rejected.length === 0 &&
                  !tooMany && (
                    <View style={styles.noteRow}>
                      <CheckIcon size={12} color={Colors.success} />
                      <Text style={styles.noteText}>All links look good</Text>
                    </View>
                  )}
              </View>
            )}

            {/* Progress while reading titles */}
            {resolving && (
              <View style={styles.progressBox}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(pct, 4)}%` },
                    ]}
                  />
                </View>
                <View style={styles.progressMeta}>
                  <Text style={styles.noteText}>
                    Checking each link before queueing
                  </Text>
                  <Text style={styles.progressPct}>
                    {progress.done}/{progress.total}
                  </Text>
                </View>
              </View>
            )}

            {tooMany && (
              <Text style={styles.error}>
                Only {MAX_ITEMS} links can be queued at once. Remove{' '}
                {urls.length - MAX_ITEMS}.
              </Text>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={resolving ? handleStop : handleClose}
            >
              <Text style={styles.secondaryText}>
                {resolving ? 'Stop' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !canStart && !resolving && styles.primaryBtnDisabled,
              ]}
              onPress={handleStart}
              disabled={!canStart}
            >
              {resolving ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.primaryText}>
                    {'Reading links\u2026'}
                  </Text>
                </>
              ) : (
                <>
                  <LayersIcon size={16} color="#fff" />
                  <Text style={styles.primaryText}>
                    {urls.length > 0
                      ? `Add ${urls.length} to queue`
                      : 'Add to queue'}
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
    case 'instagram':
      return 'instagram';
    case 'facebook':
      return 'facebook';
    case 'tiktok':
      return 'tiktok';
    case 'twitter':
      return 'twitter';
    case 'spotify':
      return 'spotify';
    default:
      return 'youtube';
  }
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderColor: Colors.border,
    // Leaves room for the keyboard and status bar; the body scrolls inside.
    maxHeight: '92%',
    ...Shadows.xl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}1F`,
    marginRight: 12,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.round,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },

  inputCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  input: {
    minHeight: 104,
    maxHeight: 150,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.sizes.sm,
    fontFamily: Platform.select({ android: 'monospace', default: undefined }),
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  counter: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.semibold,
  },
  counterOver: { color: Colors.error },
  inputActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  ghostText: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.primary}1F`,
  },
  pasteText: {
    color: Colors.primary,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  hintText: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },

  chips: { flexGrow: 0 },
  chipsContent: { gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipCount: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.black,
    color: Colors.textPrimary,
  },
  chipText: {
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.medium,
  },

  list: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  listScroll: { maxHeight: 176 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIndex: {
    width: 18,
    textAlign: 'center',
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.bold,
  },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowUrl: { flex: 1, fontSize: Typography.sizes.xs, color: Colors.textPrimary },
  rowRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },

  notes: { gap: 4 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { fontSize: Typography.sizes.xs, color: Colors.textMuted },

  progressBox: { gap: 8 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: {
    fontSize: Typography.sizes.xs,
    color: Colors.textPrimary,
    fontWeight: Typography.weights.bold,
  },

  error: { fontSize: Typography.sizes.xs, color: Colors.error, lineHeight: 16 },

  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryText: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  primaryBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryText: {
    color: '#fff',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
});
