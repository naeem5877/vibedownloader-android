/**
 * CutDownloadSheet - the desktop "Cut & Download" modal, for the phone.
 *
 * Same design language as the desktop dialog: a dark #0f0f11 surface with a
 * colour wash that follows the output type (purple for video, emerald for
 * audio), a preview with a duration badge, a sliding Video/Audio switch, the
 * accent-coloured waveform trimmer, quick presets, a Clip / Range / Saved
 * summary, quality chips and a gradient Cut & Download button.
 */
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
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  Platform,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  CloseIcon,
  ScissorsIcon,
  WarningIcon,
  SparkleIcon,
  LayersIcon,
  VideoIcon,
  MusicIcon,
  UserIcon,
  TimerIcon,
} from './Icons';
import { CutTimeline, CUT_MIN_GAP } from './CutTimeline';
import { YtDlpNative } from '../native/YtDlpModule';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VideoInfo } from '../native/YtDlpModule';

export interface CutSelection {
  /** In-point in seconds. */
  start: number;
  /** Out-point in seconds. */
  end: number;
  /** yt-dlp format id to cut. */
  formatId: string;
}

interface CutDownloadSheetProps {
  visible: boolean;
  videoInfo: VideoInfo | null;
  /** Pre-selected format id from the main quality picker, if any. */
  initialFormatId?: string | null;
  /** Resolves true when a clip is ready to download. */
  onConfirm: (selection: CutSelection) => void | Promise<void>;
  onClose: () => void;
}

type CutMode = 'video' | 'audio';

/** Same per-output accents as the desktop modal. */
const CUT_TABS = {
  video: { label: 'Video', from: '#a855f7', to: '#d946ef' },
  audio: { label: 'Audio', from: '#10b981', to: '#14b8a6' },
} as const;

const SURFACE = '#0f0f11';

interface QuickPreset {
  label: string;
  resolve: (duration: number) => [number, number];
}

/** Same presets the desktop cut modal offers, clamped to the real duration. */
const PRESETS: QuickPreset[] = [
  { label: 'First 15s', resolve: d => [0, Math.min(15, d)] },
  { label: 'First 30s', resolve: d => [0, Math.min(30, d)] },
  { label: 'Last 15s', resolve: d => [Math.max(0, d - 15), d] },
  { label: 'Middle', resolve: d => [d / 3, (2 * d) / 3] },
];

const AUDIO_QUALITIES = [
  { id: 'audio_best', label: 'Best', hint: '~320 kbps' },
  { id: 'audio_standard', label: 'Standard', hint: '~128 kbps' },
  { id: 'audio_low', label: 'Low', hint: '~64 kbps' },
];

/** `1:23`, or `1:02:03` for long media. */
function formatFull(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** `2 minutes 23 seconds` */
function formatWords(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
  return parts.join(' ');
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/**
 * Picks the progressive (video+audio in one stream) format, preferring the
 * requested id when it is still usable. A progressive stream is required
 * because cutting a DASH video-only stream would need a mux before trimming.
 */
function pickDefaultVideoFormat(
  formats: VideoInfo['formats'],
  preferred?: string | null,
): string | null {
  const list = (formats ?? []).filter(
    f => f.hasVideo !== false && f.hasAudio !== false,
  );
  if (preferred) {
    const match = list.find(f => f.formatId === preferred);
    if (match) return match.formatId;
  }
  const progressive = list.filter(
    f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none',
  );
  const pool = progressive.length > 0 ? progressive : list;
  const byHeight = [...pool].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0),
  );
  return byHeight[0]?.formatId ?? null;
}

/** One chip per resolution, tallest first. */
function listVideoFormats(formats: VideoInfo['formats'] | undefined) {
  const list = (formats ?? []).filter(
    f => f.hasVideo !== false && f.vcodec && f.vcodec !== 'none' && f.height,
  );
  const sorted = [...list].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0),
  );
  const seen = new Set<number>();
  return sorted
    .filter(f => {
      const h = f.height ?? 0;
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    })
    .slice(0, 8);
}

/** Splits chips into rows of three, so each row can be a flex row. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Cut & Download sheet.
 *
 * Picks an in/out range on a timeline, then downloads only that clip. The cut
 * itself is a post-process, so the whole media is fetched first and only the
 * trimmed copy is published.
 */
export const CutDownloadSheet: React.FC<CutDownloadSheetProps> = ({
  visible,
  videoInfo,
  initialFormatId,
  onConfirm,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const duration = videoInfo?.duration ?? 0;
  const cuttable = duration > 0;

  const [mode, setMode] = useState<CutMode>('video');
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  // 'best' is the Auto chip; anything else is a concrete yt-dlp format id.
  const [videoPick, setVideoPick] = useState<string>('best');
  const [audioFormatId, setAudioFormatId] = useState<string>('audio_best');
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accent = CUT_TABS[mode];

  // Sliding Video/Audio indicator.
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: mode === 'video' ? 0 : 1,
      stiffness: 420,
      damping: 34,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [mode, tabAnim]);
  const tabWidth = tabsWidth > 0 ? (tabsWidth - 8 - 4) / 2 : 0;
  const indicatorX = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, tabWidth + 4],
  });

  // Re-seed the selection each time the sheet opens, matching the desktop
  // modal which resets to the full length on open. Keyed on the formats array
  // rather than the whole videoInfo object, so an unrelated metadata refresh
  // cannot wipe a range the user is still adjusting.
  const formatsKey = videoInfo?.formats;
  useEffect(() => {
    if (!visible || !cuttable) return;
    setRange({ start: 0, end: duration });
    setMode('video');
    setAudioFormatId('audio_best');
    setSubmitting(false);
    const listed = listVideoFormats(formatsKey);
    setVideoPick(
      initialFormatId && listed.some(f => f.formatId === initialFormatId)
        ? initialFormatId
        : 'best',
    );
  }, [visible, cuttable, duration, initialFormatId, formatsKey]);

  // While this sheet is open the Download <-> Library tab swipe must not run:
  // the sheet sits in a Modal inside that swipe area, so a horizontal drag on
  // the trim handles would otherwise slide the screen behind it.
  useEffect(() => {
    if (!visible) return;
    return acquireTabSwipeLock();
  }, [visible]);

  // Trimming uses the ffmpeg build that ships inside the app. Probe once so the
  // button can explain itself instead of silently downloading the whole video.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const ok = await YtDlpNative.isFfmpegAvailable();
        if (!cancelled) setFfmpegAvailable(ok);
      } catch {
        if (!cancelled) setFfmpegAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const videoFormats = useMemo(
    () => listVideoFormats(videoInfo?.formats),
    [videoInfo],
  );

  const resolvedVideoId = useMemo(
    () =>
      videoPick === 'best'
        ? pickDefaultVideoFormat(videoInfo?.formats ?? [], initialFormatId)
        : videoPick,
    [videoPick, videoInfo, initialFormatId],
  );

  const clipLength = Math.max(0, range.end - range.start);
  const savedPercent =
    duration > 0
      ? Math.max(0, Math.round((1 - clipLength / duration) * 100))
      : 0;
  const tooShort = clipLength < CUT_MIN_GAP;

  const applyPreset = useCallback(
    (preset: QuickPreset) => {
      const [s, e] = preset.resolve(duration);
      setRange({ start: s, end: Math.max(e, s + CUT_MIN_GAP) });
    },
    [duration],
  );

  const handleConfirm = useCallback(async () => {
    if (!videoInfo || submitting) return;
    const formatId = mode === 'audio' ? audioFormatId : resolvedVideoId;
    if (!formatId) return;

    setSubmitting(true);
    try {
      await onConfirm({ start: range.start, end: range.end, formatId });
    } finally {
      setSubmitting(false);
    }
  }, [
    videoInfo,
    submitting,
    mode,
    audioFormatId,
    resolvedVideoId,
    range.start,
    range.end,
    onConfirm,
  ]);

  const blockedReason = !cuttable
    ? 'This media has no known duration, so a range cannot be picked.'
    : ffmpegAvailable === false
    ? 'Trimming uses ffmpeg, which is already included in this app. It cannot start on this device, so download the full file instead.'
    : null;

  const cutDisabled =
    !!blockedReason ||
    ffmpegAvailable === null ||
    tooShort ||
    submitting ||
    (mode === 'video' && !resolvedVideoId);

  /* ───────── quality chips ───────── */
  type Chip = {
    key: string;
    title: string;
    badge?: { text: string; bg: string; fg: string };
    hint: string;
    active: boolean;
    onPress: () => void;
  };

  const chips: Chip[] = useMemo(() => {
    if (mode === 'audio') {
      return AUDIO_QUALITIES.map(q => ({
        key: q.id,
        title: q.label,
        hint: q.hint,
        active: audioFormatId === q.id,
        onPress: () => setAudioFormatId(q.id),
      }));
    }
    const list: Chip[] = [];
    if (videoFormats.length > 0) {
      list.push({
        key: 'best',
        title: 'Best',
        badge: { text: 'Auto', bg: 'rgba(255,255,255,0.10)', fg: 'rgba(255,255,255,0.7)' },
        hint: 'Highest available',
        active: videoPick === 'best',
        onPress: () => setVideoPick('best'),
      });
    }
    videoFormats.forEach(f => {
      const h = f.height ?? 0;
      const size = formatBytes(f.filesize);
      list.push({
        key: f.formatId,
        title: `${h}p`,
        badge:
          h >= 2160
            ? { text: '4K', bg: 'rgba(217,70,239,0.20)', fg: '#f0abfc' }
            : h >= 1440
            ? { text: '2K', bg: 'rgba(14,165,233,0.20)', fg: '#7dd3fc' }
            : undefined,
        hint: `${f.ext?.toUpperCase() || 'MP4'}${
          size ? ` · ${size}` : f.formatNote ? ` · ${f.formatNote}` : ''
        }`,
        active: videoPick === f.formatId,
        onPress: () => setVideoPick(f.formatId),
      });
    });
    return list;
  }, [mode, audioFormatId, videoFormats, videoPick]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Colour wash that follows the output type */}
          <View style={styles.wash} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient
                  id="cutWash"
                  cx="70%"
                  cy="0%"
                  rx="60%"
                  ry="100%"
                  fx="70%"
                  fy="0%"
                >
                  <Stop offset="0%" stopColor={accent.from} stopOpacity={0.16} />
                  <Stop offset="100%" stopColor={accent.from} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#cutWash)" />
            </Svg>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLabel}>
              <ScissorsIcon size={14} color="rgba(255,255,255,0.4)" />
              <Text style={styles.headerLabelText}>CUT &amp; DOWNLOAD</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close"
              activeOpacity={0.7}
            >
              <CloseIcon size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Preview */}
            <View style={styles.previewWrap}>
              {videoInfo?.thumbnail ? (
                <Image
                  source={{ uri: videoInfo.thumbnail }}
                  style={styles.preview}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.preview, styles.previewEmpty]}>
                  <VideoIcon size={40} color="rgba(255,255,255,0.2)" />
                </View>
              )}
              <View style={styles.previewFade} pointerEvents="none">
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id="cutFade" x1="0" y1="1" x2="0" y2="0">
                      <Stop offset="0" stopColor="#000" stopOpacity={0.6} />
                      <Stop offset="0.5" stopColor="#000" stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#cutFade)" />
                </Svg>
              </View>
              {cuttable && (
                <View style={styles.durBadge}>
                  <TimerIcon size={12} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.durText}>{formatFull(duration)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {videoInfo?.title ?? 'Select a clip'}
            </Text>
            {!!videoInfo?.uploader && (
              <View style={styles.uploaderRow}>
                <UserIcon size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.uploader} numberOfLines={1}>
                  {videoInfo.uploader}
                </Text>
              </View>
            )}

            {blockedReason ? (
              <View style={styles.blocked}>
                <WarningIcon size={16} color="#fbbf24" />
                <Text style={styles.blockedText}>{blockedReason}</Text>
              </View>
            ) : null}

            {cuttable && (
              <>
                {/* Video / Audio switch with a sliding indicator */}
                <View
                  style={styles.tabs}
                  onLayout={e => setTabsWidth(e.nativeEvent.layout.width)}
                >
                  {tabWidth > 0 && (
                    <Animated.View
                      style={[
                        styles.tabIndicator,
                        { width: tabWidth, transform: [{ translateX: indicatorX }] },
                      ]}
                    />
                  )}
                  {(['video', 'audio'] as const).map(id => {
                    const active = mode === id;
                    const Icon = id === 'video' ? VideoIcon : MusicIcon;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={styles.tab}
                        onPress={() => setMode(id)}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Icon
                          size={14}
                          color={active ? CUT_TABS[id].from : 'rgba(255,255,255,0.45)'}
                        />
                        <Text
                          style={[styles.tabText, active && styles.tabTextActive]}
                        >
                          {CUT_TABS[id].label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.hint}>
                  Drag the handles, or tap the track to trim
                </Text>

                {/* Timeline */}
                <View style={styles.sectionHead}>
                  <View style={styles.sectionLabelRow}>
                    <LayersIcon size={14} color="rgba(255,255,255,0.35)" />
                    <Text style={styles.sectionLabel}>TIMELINE</Text>
                  </View>
                  <View
                    style={[
                      styles.lengthChip,
                      {
                        borderColor: `${accent.from}40`,
                        backgroundColor: `${accent.from}14`,
                      },
                    ]}
                  >
                    <ScissorsIcon size={12} color={accent.from} />
                    <Text style={[styles.lengthChipText, { color: accent.from }]}>
                      {formatFull(clipLength)}
                    </Text>
                  </View>
                </View>

                <CutTimeline
                  duration={duration}
                  start={range.start}
                  end={range.end}
                  onChange={(start, end) => setRange({ start, end })}
                  accent={accent.from}
                />

                {/* Quick presets */}
                <View style={styles.presets}>
                  {PRESETS.map(preset => (
                    <TouchableOpacity
                      key={preset.label}
                      style={styles.preset}
                      onPress={() => applyPreset(preset)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.presetText}>{preset.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Clip summary */}
                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>CLIP</Text>
                    <View style={styles.summaryRight}>
                      <Text style={styles.summaryBig}>{formatFull(clipLength)}</Text>
                      <Text style={styles.summarySmall}>
                        {formatWords(clipLength)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryDivider]}>
                    <Text style={styles.summaryKey}>RANGE</Text>
                    <Text style={styles.summaryValue}>
                      {formatFull(range.start)} → {formatFull(range.end)}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryDivider]}>
                    <Text style={styles.summaryKey}>SAVED</Text>
                    <Text style={styles.summaryValue}>{savedPercent}%</Text>
                  </View>
                </View>

                {/* Quality */}
                <Text style={[styles.sectionLabel, styles.qualityLabel]}>
                  {mode === 'video' ? 'VIDEO QUALITY' : 'AUDIO QUALITY'}
                </Text>
                {chips.length > 0 ? (
                  <View style={styles.chipGrid}>
                    {chunk(chips, 3).map((row, ri) => (
                      <View key={ri} style={styles.chipRow}>
                        {row.map(c => (
                          <TouchableOpacity
                            key={c.key}
                            style={[styles.chip, c.active && styles.chipActive]}
                            onPress={c.onPress}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityState={{ selected: c.active }}
                          >
                            <View style={styles.chipTitleRow}>
                              <Text
                                style={[
                                  styles.chipTitle,
                                  c.active && styles.chipTitleActive,
                                ]}
                              >
                                {c.title}
                              </Text>
                              {c.badge && (
                                <View
                                  style={[
                                    styles.chipBadge,
                                    { backgroundColor: c.badge.bg },
                                  ]}
                                >
                                  <Text
                                    style={[styles.chipBadgeText, { color: c.badge.fg }]}
                                  >
                                    {c.badge.text}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.chipHint} numberOfLines={1}>
                              {c.hint}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {/* Keep a short last row aligned to the same grid. */}
                        {Array.from({ length: 3 - row.length }, (_, i) => (
                          <View key={`pad${i}`} style={styles.chipPad} />
                        ))}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.note}>
                    No quality list was returned for this media; the default
                    quality is used.
                  </Text>
                )}

                <View style={styles.infoRow}>
                  <SparkleIcon size={14} color="rgba(255,255,255,0.35)" />
                  <Text style={styles.infoText}>
                    Your clip will be saved as a separate{' '}
                    {mode === 'video' ? 'video' : 'audio'} file. The full media
                    is fetched first, then trimmed to the nearest keyframe.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          {/* Action (stays visible while the sheet scrolls) */}
          <View
            style={[
              styles.footer,
              { paddingBottom: (Platform.OS === 'ios' ? 28 : 20) + insets.bottom },
            ]}
          >
            <View style={styles.footerFade} pointerEvents="none">
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="footFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={SURFACE} stopOpacity={0} />
                    <Stop offset="1" stopColor={SURFACE} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#footFade)" />
              </Svg>
            </View>
            {cuttable && tooShort && (
              <Text style={styles.warn}>Select a longer range to cut.</Text>
            )}
            <TouchableOpacity
              style={[
                styles.cutBtn,
                { shadowColor: accent.from },
                cutDisabled && styles.cutBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={cutDisabled}
              activeOpacity={0.85}
              accessibilityLabel="Cut and download"
            >
              <View style={StyleSheet.absoluteFill}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id="cutBtnGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={accent.from} />
                      <Stop offset="1" stopColor={accent.to} />
                    </LinearGradient>
                  </Defs>
                  <Rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="url(#cutBtnGrad)"
                  />
                </Svg>
              </View>
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <ScissorsIcon size={16} color="#fff" />
                  <Text style={styles.cutBtnText}>Cut &amp; Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.10)',
    maxHeight: '94%',
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLabelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.4)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20 },
  bodyContent: { paddingBottom: 24 },

  previewWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  preview: { width: '100%', aspectRatio: 16 / 9 },
  previewEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  previewFade: { ...StyleSheet.absoluteFillObject },
  durBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  durText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },
  title: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#fff',
  },
  uploaderRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  uploader: { flexShrink: 1, fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  blocked: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.30)',
  },
  blockedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
  },

  tabs: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tab: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  tabTextActive: { color: '#fff' },
  hint: { marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  sectionHead: {
    marginTop: 20,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  lengthChip: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lengthChipText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  presets: { marginTop: 16, flexDirection: 'row', gap: 8 },
  preset: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },

  summary: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  summaryKey: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  summaryRight: { alignItems: 'flex-end' },
  summaryBig: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  summarySmall: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  summaryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    fontVariant: ['tabular-nums'],
  },

  qualityLabel: { marginTop: 24, marginBottom: 8 },
  chipGrid: { gap: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  chipPad: { flex: 1 },
  chipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipTitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  chipTitleActive: { color: '#fff' },
  chipBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  chipBadgeText: { fontSize: 9, fontWeight: '700' },
  chipHint: { marginTop: 1, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.4)' },
  note: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.4)' },

  infoRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.35)',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    backgroundColor: SURFACE,
  },
  footerFade: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    height: 24,
  },
  warn: {
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(252,211,77,0.8)',
  },
  cutBtn: {
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Coloured glow under the button, like desktop's box-shadow.
    elevation: 10,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cutBtnDisabled: { opacity: 0.4 },
  cutBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
