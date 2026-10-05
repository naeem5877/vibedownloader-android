import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import {
  CloseIcon,
  ScissorsIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from './Icons';
import { CutTimeline, formatCutTime, CUT_MIN_GAP } from './CutTimeline';
import { YtDlpNative } from '../native/YtDlpModule';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';
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
  { id: 'audio_best', label: 'Best', hint: 'Source quality' },
  { id: 'audio_standard', label: 'Standard', hint: '~128 kbps' },
  { id: 'audio_low', label: 'Small', hint: '~64 kbps' },
];

/** `1:23.4`, for the clip summary line. */
function formatFull(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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
  const duration = videoInfo?.duration ?? 0;
  const cuttable = duration > 0;

  const [mode, setMode] = useState<CutMode>('video');
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [videoFormatId, setVideoFormatId] = useState<string | null>(null);
  const [audioFormatId, setAudioFormatId] = useState<string>('audio_best');
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setVideoFormatId(pickDefaultVideoFormat(formatsKey ?? [], initialFormatId));
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

  const videoFormats = useMemo(() => {
    const list = (videoInfo?.formats ?? []).filter(
      f => f.hasVideo !== false && f.vcodec && f.vcodec !== 'none' && f.height,
    );
    return [...list].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  }, [videoInfo]);

  const clipLength = Math.max(0, range.end - range.start);
  const savedPercent =
    duration > 0 ? Math.round((1 - clipLength / duration) * 100) : 0;
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
    const formatId = mode === 'audio' ? audioFormatId : videoFormatId;
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
    videoFormatId,
    range.start,
    range.end,
    onConfirm,
  ]);

  const blockedReason = !cuttable
    ? 'This media has no known duration, so a range cannot be picked.'
    : ffmpegAvailable === false
    ? 'Trimming uses ffmpeg, which is already included in this app. It cannot start on this device, so download the full file instead.'
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <ScissorsIcon size={18} color={Colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Cut &amp; Download</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {videoInfo?.title ?? 'Select a clip'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <CloseIcon size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {videoInfo?.thumbnail ? (
              <Image
                source={{ uri: videoInfo.thumbnail }}
                style={styles.preview}
                resizeMode="cover"
              />
            ) : null}

            {blockedReason ? (
              <View style={styles.blocked}>
                <WarningIcon size={16} color={Colors.warning} />
                <Text style={styles.blockedText}>{blockedReason}</Text>
              </View>
            ) : null}

            {cuttable && (
              <>
                <View style={styles.summaryRow}>
                  <SummaryStat
                    label="Clip"
                    value={formatFull(clipLength)}
                    highlight
                  />
                  <SummaryStat label="Saved" value={`${savedPercent}%`} />
                  <SummaryStat label="Total" value={formatFull(duration)} />
                </View>

                <CutTimeline
                  duration={duration}
                  start={range.start}
                  end={range.end}
                  onChange={(start, end) => setRange({ start, end })}
                />

                <View style={styles.presets}>
                  {PRESETS.map(preset => (
                    <TouchableOpacity
                      key={preset.label}
                      style={styles.preset}
                      onPress={() => applyPreset(preset)}
                    >
                      <Text style={styles.presetText}>{preset.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>Save as</Text>
                <View style={styles.segment}>
                  <SegmentTab
                    label="Video"
                    active={mode === 'video'}
                    onPress={() => setMode('video')}
                  />
                  <SegmentTab
                    label="Audio"
                    active={mode === 'audio'}
                    onPress={() => setMode('audio')}
                  />
                </View>

                {mode === 'video' ? (
                  <View style={styles.options}>
                    <OptionRow
                      label="Best available"
                      hint={videoFormats[0]?.resolution ?? 'Recommended'}
                      selected={videoFormatId === videoFormats[0]?.formatId}
                      onPress={() =>
                        setVideoFormatId(videoFormats[0]?.formatId ?? null)
                      }
                    />
                    {videoFormats.slice(0, 8).map(f => (
                      <OptionRow
                        key={f.formatId}
                        label={f.resolution ?? f.formatNote ?? f.formatId}
                        hint={f.ext ? f.ext.toUpperCase() : undefined}
                        selected={videoFormatId === f.formatId}
                        onPress={() => setVideoFormatId(f.formatId)}
                      />
                    ))}
                    {videoFormats.length === 0 && (
                      <Text style={styles.note}>
                        No quality list was returned for this media; the default
                        quality is used.
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.options}>
                    {AUDIO_QUALITIES.map(q => (
                      <OptionRow
                        key={q.id}
                        label={q.label}
                        hint={q.hint}
                        selected={audioFormatId === q.id}
                        onPress={() => setAudioFormatId(q.id)}
                      />
                    ))}
                  </View>
                )}

                <View style={styles.infoRow}>
                  <InfoIcon size={13} color={Colors.textMuted} />
                  <Text style={styles.infoText}>
                    The whole video is fetched first, then trimmed. Start and
                    end land on the nearest video keyframe.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (blockedReason || tooShort) && styles.primaryBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={
                !!blockedReason ||
                ffmpegAvailable === null ||
                tooShort ||
                submitting ||
                (mode === 'video' && !videoFormatId)
              }
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <ScissorsIcon size={16} color="#fff" />
                  <Text style={styles.primaryText}>
                    {`Cut ${formatCutTime(clipLength)} & download`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const SummaryStat: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <View style={styles.stat}>
    <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const SegmentTab: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.segmentTab, active && styles.segmentTabActive]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const OptionRow: React.FC<{
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}> = ({ label, hint, selected, onPress }) => (
  <TouchableOpacity
    style={styles.option}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
  >
    <View style={styles.optionText}>
      <Text
        style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
    </View>
    {selected ? <CheckIcon size={16} color={Colors.primary} /> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}1F`,
    marginRight: Spacing.md,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: { padding: 6 },
  body: { paddingHorizontal: Spacing.lg },
  bodyContent: { paddingBottom: Spacing.lg },
  preview: {
    width: '100%',
    height: 150,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  blocked: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.warning}14`,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
    marginBottom: Spacing.md,
  },
  blockedText: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  statValueHighlight: { color: Colors.primary },
  statLabel: {
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  preset: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.round,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textPrimary,
    fontWeight: Typography.weights.medium,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.semibold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: BorderRadius.sm,
  },
  segmentTabActive: { backgroundColor: `${Colors.primary}26` },
  segmentText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
  },
  segmentTextActive: { color: Colors.primary },
  options: { marginTop: Spacing.sm, gap: Spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: Typography.sizes.sm, color: Colors.textPrimary },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: Typography.weights.semibold,
  },
  optionHint: {
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  note: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: '#fff',
  },
});
