/**
 * LibraryEditor - the desktop "library editor" modal, for the phone.
 *
 * Three quick edits on a video that is already in the library, each saved as a
 * NEW file beside the original (the original is never touched):
 *   Audio    pull the soundtrack out as MP3 / M4A
 *   Convert  change format (MP4 / WebM / MKV), shrink the resolution, pick quality
 *   GIF      loop a short moment (up to 15 s) with a live loop preview
 *
 * Same design language as the desktop dialog and as CutDownloadSheet: a dark
 * #0f0f11 surface, a colour wash that follows the active tab (green Audio,
 * blue Convert, pink GIF), a sliding tab switch, chip groups, and a gradient
 * action button. Progress, cancel and the finished result all live inside the
 * sheet instead of a separate job list, since a phone has no room for one.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  ImageIcon,
  MusicNoteIcon,
  ShareIcon,
  SparkleIcon,
  WandIcon,
  WarningIcon,
  ZapIcon,
} from './Icons';
import { EditorPlayer } from './EditorPlayer';
import { GifRangePicker } from './GifRangePicker';
import {
  YtDlpNative,
  formatFileSize,
  onLibraryEditProgress,
  type LibraryEditRequest,
  type LibraryEditResult,
} from '../native/YtDlpModule';
import type { LibraryItem } from '../utils/libraryMedia';
import { normalizePlatform } from '../utils/libraryMedia';
import { getPlatformColor } from '../theme';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';
import { Haptics } from '../utils/haptics';

/* ------------------------------------------------------------------ helpers */

const SURFACE = '#0f0f11';

/** `1:05.5`: seconds are padded so the readout does not jitter while dragging. */
function clock(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

type Tab = 'audio' | 'convert' | 'gif';

interface TabMeta {
  id: Tab;
  label: string;
  blurb: string;
  Icon: React.FC<{ size?: number; color?: string }>;
  from: string;
  to: string;
}

/** Same per-tab accents as the desktop editor. */
const TABS: TabMeta[] = [
  { id: 'audio', label: 'Audio', blurb: 'Pull the soundtrack out', Icon: MusicNoteIcon, from: '#10b981', to: '#14b8a6' },
  { id: 'convert', label: 'Convert', blurb: 'Change format or shrink', Icon: ZapIcon, from: '#38bdf8', to: '#8b5cf6' },
  { id: 'gif', label: 'GIF', blurb: 'Loop a short moment', Icon: ImageIcon, from: '#d946ef', to: '#fb923c' },
];

/** A GIF longer than this is rarely shareable, so the range is capped. */
const GIF_MAX_SECONDS = 15;

/* --------------------------------------------------------------- small bits */

interface Opt<T> {
  id: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

function Chips<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.chipWrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map(o => {
          const active = o.id === value;
          return (
            <TouchableOpacity
              key={String(o.id)}
              style={[styles.chip, active && styles.chipActive, o.disabled && styles.chipDisabled]}
              disabled={o.disabled}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.selection();
                onChange(o.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !!o.disabled }}
            >
              <Text style={[styles.chipTitle, active && styles.chipTitleActive]}>{o.label}</Text>
              {o.sub ? <Text style={styles.chipSub}>{o.sub}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- editor */

interface LibraryEditorProps {
  item: LibraryItem;
  /** Poster frame already generated for the gallery tile, if any. */
  poster?: string | null;
  onClose: () => void;
  /** Called once a new file has been saved, so the gallery can refresh. */
  onDone?: (result: LibraryEditResult) => void;
}

type Phase = 'edit' | 'running' | 'done';

export const LibraryEditor: React.FC<LibraryEditorProps> = ({
  item,
  poster,
  onClose,
  onDone,
}) => {
  const insets = useSafeAreaInsets();

  // The gallery reports duration in milliseconds (-1 when unreadable).
  const listedDur = item.duration && item.duration > 0 ? item.duration / 1000 : 0;
  const [probe, setProbe] = useState<{ width: number; height: number; duration: number } | null>(null);
  const dur = probe && probe.duration > 0 ? probe.duration : listedDur > 0 ? listedDur : 30;
  const srcW = probe?.width ?? 0;
  const srcH = probe?.height ?? 0;
  const srcMin = srcW && srcH ? Math.min(srcW, srcH) : 0;
  const srcMax = srcW && srcH ? Math.max(srcW, srcH) : 0;

  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('audio');
  const [phase, setPhase] = useState<Phase>('edit');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LibraryEditResult | null>(null);

  // Audio
  const [aFormat, setAFormat] = useState<'mp3' | 'm4a'>('mp3');
  const [aQuality, setAQuality] = useState<'best' | 'standard'>('best');

  // Convert
  const [cFormat, setCFormat] = useState<'mp4' | 'webm' | 'mkv'>('mp4');
  const [cHeight, setCHeight] = useState(0);
  const [cQuality, setCQuality] = useState<'high' | 'balanced' | 'small'>('balanced');

  // GIF
  const [gLen, setGLen] = useState(() => Math.min(5, dur));
  const [gStart, setGStart] = useState(0);
  const [gWidth, setGWidth] = useState(480);
  const [gFps, setGFps] = useState(15);

  const jobRef = useRef<string | null>(null);
  const meta = TABS.find(t => t.id === tab)!;
  const platformKey = normalizePlatform(item.platform);
  const platformTint = getPlatformColor(platformKey || item.platform);

  // The tab swipe behind this sheet must not run while a timeline handle is dragged.
  useEffect(() => acquireTabSwipeLock(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await YtDlpNative.getMediaProbe(item.path);
        if (!cancelled) setProbe(p);
      } catch {
        // No size shown; the edit itself does not depend on it.
      }
    })();
    (async () => {
      try {
        const ok = await YtDlpNative.isFfmpegAvailable();
        if (!cancelled) setFfmpegOk(ok);
      } catch {
        if (!cancelled) setFfmpegOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.path]);

  useEffect(
    () =>
      onLibraryEditProgress(p => {
        if (p.jobId === jobRef.current) setPct(p.pct);
      }),
    [],
  );

  // Once the real length is known, a default range chosen against the guessed
  // length must still fit inside it.
  const maxLen = Math.min(GIF_MAX_SECONDS, dur);
  const len = Math.min(gLen, maxLen);
  const start = Math.min(gStart, Math.max(0, dur - len));

  // The picker already clamps to [0.5 s, maxLen] and to the video, so values
  // arrive ready to use.
  const onPick = useCallback((s: number, l: number) => {
    setGStart(s);
    setGLen(l);
  }, []);

  const heights = useMemo(
    () => [
      { id: 0, label: 'Original', sub: srcMin ? `${srcMin}p` : undefined, disabled: false },
      ...[1080, 720, 480, 360].map(h => ({
        id: h,
        label: `${h}p`,
        sub: undefined as string | undefined,
        disabled: !!srcMin && h >= srcMin,
      })),
    ],
    [srcMin],
  );

  // Resolutions name the short side, so a portrait clip at 720p is 720 wide.
  const outDims = useMemo(() => {
    if (!srcMin || !srcMax) return null;
    const scale = cHeight && cHeight < srcMin ? cHeight / srcMin : 1;
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    return srcH > srcW ? `${even(srcMin)}×${even(srcMax)}` : `${even(srcMax)}×${even(srcMin)}`;
  }, [srcMin, srcMax, srcW, srcH, cHeight]);

  const audioKbps =
    aQuality === 'best' ? (aFormat === 'mp3' ? 320 : 256) : aFormat === 'mp3' ? 192 : 128;
  const audioEstimate = audioKbps * 125 * dur;

  const presets = [
    {
      name: 'Share anywhere',
      sub: '720p MP4 · small',
      apply: () => {
        setCFormat('mp4');
        setCHeight(srcMin && srcMin <= 720 ? 0 : 720);
        setCQuality('small');
      },
    },
    {
      name: 'Smallest file',
      sub: '480p MP4 · smallest',
      apply: () => {
        setCFormat('mp4');
        setCHeight(srcMin && srcMin <= 480 ? 0 : 480);
        setCQuality('small');
      },
    },
    {
      name: 'Universal',
      sub: 'MP4 · keep size',
      apply: () => {
        setCFormat('mp4');
        setCHeight(0);
        setCQuality('balanced');
      },
    },
  ];

  const gifHeavy = len > 8 && gWidth >= 480 && gFps >= 15;

  // Rough on purpose: GIF size depends heavily on how busy the footage is.
  const gifAspect = srcW && srcH ? srcH / srcW : 9 / 16;
  const gifEstimate = gWidth * (gWidth * gifAspect) * gFps * len * 0.25;

  const actionLabel =
    tab === 'audio'
      ? `Extract ${aFormat.toUpperCase()}`
      : tab === 'convert'
      ? `Convert to ${cFormat.toUpperCase()}`
      : 'Create GIF';

  const buildRequest = (): LibraryEditRequest => {
    if (tab === 'audio') return { type: 'audio', format: aFormat, quality: aQuality };
    if (tab === 'convert') {
      return { type: 'convert', format: cFormat, height: cHeight, quality: cQuality };
    }
    return { type: 'gif', start, length: len, width: gWidth, fps: gFps };
  };

  const run = useCallback(async () => {
    if (phase === 'running') return;
    const jobId = `edit-${Date.now()}`;
    if (typeof YtDlpNative.editLibraryFile !== 'function') {
      setError('This build of the app is out of date. Reinstall the latest build to use the editor.');
      return;
    }
    jobRef.current = jobId;
    setError(null);
    setPct(0);
    setPhase('running');
    Haptics.impact();
    try {
      const res = await YtDlpNative.editLibraryFile(
        jobId,
        item.path,
        item.platform || null,
        buildRequest(),
      );
      if (res.cancelled) {
        setPhase('edit');
        return;
      }
      if (!res.success) {
        Haptics.error();
        setError(res.error ?? 'The edit failed.');
        setPhase('edit');
        return;
      }
      Haptics.success();
      setResult(res);
      setPhase('done');
      onDone?.(res);
    } catch (e) {
      Haptics.error();
      setError(e instanceof Error ? e.message : 'The edit failed.');
      setPhase('edit');
    } finally {
      jobRef.current = null;
    }
    // buildRequest reads the current option state on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item.path, item.platform, tab, aFormat, aQuality, cFormat, cHeight, cQuality, start, len, gWidth, gFps, onDone]);

  const cancel = useCallback(() => {
    const id = jobRef.current;
    if (id) YtDlpNative.cancelLibraryEdit(id).catch(() => {});
  }, []);

  // Closing mid-edit stops it: a half-finished encode would keep the CPU busy
  // for a file nobody is waiting for.
  const handleClose = useCallback(() => {
    if (phase === 'running') cancel();
    onClose();
  }, [phase, cancel, onClose]);

  const share = useCallback(() => {
    if (result?.path) {
      Haptics.impact();
      YtDlpNative.shareFile?.(result.path);
    }
  }, [result]);

  // Sliding tab indicator.
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: TABS.findIndex(t => t.id === tab),
      stiffness: 420,
      damping: 34,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [tab, tabAnim]);
  const tabWidth = tabsWidth > 0 ? (tabsWidth - 8 - 8) / 3 : 0;
  const indicatorX = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth + 4, (tabWidth + 4) * 2],
  });

  const running = phase === 'running';
  const blockedReason =
    ffmpegOk === false
      ? 'Editing uses ffmpeg, which is already included in this app. It cannot start on this device.'
      : null;
  const actionDisabled = !!blockedReason || ffmpegOk === null || running;

  const savedPct =
    result?.inBytes && result.outBytes
      ? Math.round((1 - result.outBytes / result.inBytes) * 100)
      : null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Colour wash that follows the active tab */}
          <View style={styles.wash} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="editWash" cx="70%" cy="0%" rx="60%" ry="100%" fx="70%" fy="0%">
                  <Stop offset="0%" stopColor={meta.from} stopOpacity={0.16} />
                  <Stop offset="100%" stopColor={meta.from} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#editWash)" />
            </Svg>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLabel}>
              <WandIcon size={14} color="rgba(255,255,255,0.4)" />
              <Text style={styles.headerLabelText}>EDITOR</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              accessibilityLabel="Close editor"
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
            scrollEnabled={phase !== 'running'}
          >
            {/* Preview */}
            <View style={[styles.preview, { backgroundColor: `${platformTint}26` }]}>
              <EditorPlayer
                path={item.path}
                poster={poster ?? item.thumbnail}
                gifRange={tab === 'gif' ? { start, length: len } : null}
                fallbackDuration={dur}
                accent={meta.from}
              />
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.sub}>
              {[
                item.extension.toUpperCase(),
                srcMax ? `${srcW}×${srcH}` : '',
                item.size > 0 ? formatFileSize(item.size) : '',
                listedDur > 0 || probe?.duration ? clock(dur) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {blockedReason ? (
              <View style={styles.blocked}>
                <WarningIcon size={16} color="#fbbf24" />
                <Text style={styles.blockedText}>{blockedReason}</Text>
              </View>
            ) : null}

            {/* Tabs with a sliding indicator */}
            <View style={styles.tabs} onLayout={e => setTabsWidth(e.nativeEvent.layout.width)}>
              {tabWidth > 0 && (
                <Animated.View
                  style={[
                    styles.tabIndicator,
                    { width: tabWidth, transform: [{ translateX: indicatorX }] },
                  ]}
                />
              )}
              {TABS.map(t => {
                const active = tab === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.tab}
                    disabled={running}
                    onPress={() => {
                      Haptics.selection();
                      setTab(t.id);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <t.Icon size={14} color={active ? t.from : 'rgba(255,255,255,0.45)'} />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.blurb}>{meta.blurb}</Text>

            <View style={[styles.panel, running && styles.panelLocked]} pointerEvents={running ? 'none' : 'auto'}>
              {tab === 'audio' && (
                <>
                  <Chips
                    label="Format"
                    value={aFormat}
                    onChange={setAFormat}
                    options={[
                      { id: 'mp3', label: 'MP3', sub: 'plays everywhere' },
                      { id: 'm4a', label: 'M4A', sub: 'AAC · smaller' },
                    ]}
                  />
                  <Chips
                    label="Quality"
                    value={aQuality}
                    onChange={setAQuality}
                    options={[
                      { id: 'best', label: 'Best', sub: aFormat === 'mp3' ? '320 kbps' : '256 kbps' },
                      { id: 'standard', label: 'Standard', sub: aFormat === 'mp3' ? '192 kbps' : '128 kbps' },
                    ]}
                  />
                  <Text style={styles.note}>
                    About <Text style={styles.noteStrong}>{formatFileSize(audioEstimate)}</Text>
                    {item.size > 0 ? `, from a ${formatFileSize(item.size)} video` : ''}. Tags carry over.
                  </Text>
                </>
              )}

              {tab === 'convert' && (
                <>
                  <View>
                    <Text style={styles.fieldLabel}>QUICK PRESETS</Text>
                    <View style={styles.presetRow}>
                      {presets.map(p => (
                        <TouchableOpacity
                          key={p.name}
                          style={styles.preset}
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.selection();
                            p.apply();
                          }}
                        >
                          <Text style={styles.presetName}>{p.name}</Text>
                          <Text style={styles.presetSub}>{p.sub}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Chips
                    label="Format"
                    value={cFormat}
                    onChange={setCFormat}
                    options={[
                      { id: 'mp4', label: 'MP4', sub: 'universal' },
                      { id: 'webm', label: 'WebM', sub: 'slower, smaller' },
                      { id: 'mkv', label: 'MKV', sub: 'flexible' },
                    ]}
                  />
                  <Chips label="Resolution" value={cHeight} onChange={setCHeight} options={heights} />
                  {srcMin > 0 && heights.every(h => h.id === 0 || h.disabled) && (
                    <Text style={styles.noteSmall}>
                      Already {srcMin}p, so there is nothing smaller to shrink to. Format and quality still apply.
                    </Text>
                  )}
                  <Chips
                    label="Quality"
                    value={cQuality}
                    onChange={setCQuality}
                    options={[
                      { id: 'high', label: 'High', sub: 'bigger file' },
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'small', label: 'Small', sub: 'smaller file' },
                    ]}
                  />
                  <Text style={styles.note}>
                    Output{' '}
                    <Text style={styles.noteStrong}>
                      {cFormat.toUpperCase()}
                      {outDims ? ` · ${outDims}` : ''}
                    </Text>
                    {cFormat === 'webm' ? ' · WebM is slow on a phone, so long videos can take a while' : ''}
                  </Text>
                </>
              )}

              {tab === 'gif' && (
                <>
                  <GifRangePicker
                    path={item.path}
                    duration={dur}
                    start={start}
                    length={len}
                    maxLength={maxLen}
                    accent={meta.from}
                    poster={poster ?? item.thumbnail}
                    onChange={onPick}
                  />
                  <Chips
                    label="Width"
                    value={gWidth}
                    onChange={setGWidth}
                    options={[
                      { id: 320, label: '320', sub: 'small' },
                      { id: 480, label: '480', sub: 'balanced' },
                      { id: 640, label: '640', sub: 'sharp' },
                    ]}
                  />
                  <Chips
                    label="Smoothness"
                    value={gFps}
                    onChange={setGFps}
                    options={[
                      { id: 10, label: '10 fps', sub: 'lightest' },
                      { id: 15, label: '15 fps', sub: 'balanced' },
                      { id: 20, label: '20 fps', sub: 'smoothest' },
                    ]}
                  />
                  <View style={[styles.sizeCard, gifHeavy && styles.sizeCardWarn]}>
                    <View style={styles.sizeTop}>
                      <Text style={styles.sizeKey}>ESTIMATED SIZE</Text>
                      <Text style={[styles.sizeValue, gifHeavy && styles.sizeValueWarn]}>
                        {`≈ ${formatFileSize(gifEstimate)}`}
                      </Text>
                    </View>
                    <Text style={[styles.sizeNote, gifHeavy && styles.noteWarn]}>
                      {gifHeavy
                        ? 'Big file. Shorter, narrower or 10 fps keeps it small enough to share.'
                        : `Up to ${GIF_MAX_SECONDS} seconds. Short and narrow GIFs stay small.`}
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.infoRow}>
              <SparkleIcon size={14} color="rgba(255,255,255,0.35)" />
              <Text style={styles.infoText}>
                Your original is never changed. Each edit is saved as a new file beside it.
              </Text>
            </View>
          </ScrollView>

          {/* Footer: action, progress, or the finished result */}
          <View
            style={[
              styles.footer,
              { paddingBottom: (Platform.OS === 'ios' ? 28 : 20) + insets.bottom },
            ]}
          >
            <View style={styles.footerFade} pointerEvents="none">
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="editFootFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={SURFACE} stopOpacity={0} />
                    <Stop offset="1" stopColor={SURFACE} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#editFootFade)" />
              </Svg>
            </View>

            {phase === 'edit' && (
              <>
                {error ? (
                  <View style={styles.errorBox}>
                    <WarningIcon size={14} color="#f87171" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { shadowColor: meta.from },
                    actionDisabled && styles.actionBtnDisabled,
                  ]}
                  onPress={run}
                  disabled={actionDisabled}
                  activeOpacity={0.85}
                  accessibilityLabel={actionLabel}
                >
                  <View style={StyleSheet.absoluteFill}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <LinearGradient id="editBtnGrad" x1="0" y1="0" x2="1" y2="0">
                          <Stop offset="0" stopColor={meta.from} />
                          <Stop offset="1" stopColor={meta.to} />
                        </LinearGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="100%" fill="url(#editBtnGrad)" />
                    </Svg>
                  </View>
                  {ffmpegOk === null ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.actionText}>{actionLabel}</Text>
                      <ArrowRightIcon size={16} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {phase === 'running' && (
              <View style={styles.runBox}>
                <View style={styles.runTop}>
                  <View style={styles.runLabelRow}>
                    <ActivityIndicator size="small" color={meta.from} />
                    <Text style={styles.runLabel}>
                      {tab === 'audio' ? 'Extracting audio' : tab === 'convert' ? 'Converting' : 'Making GIF'}
                    </Text>
                  </View>
                  <Text style={styles.runPct}>{pct >= 0 ? `${Math.round(pct)}%` : ''}</Text>
                </View>
                <View style={styles.runTrack}>
                  <View
                    style={[
                      styles.runFill,
                      {
                        backgroundColor: meta.from,
                        width: `${pct >= 0 ? Math.max(3, Math.min(100, pct)) : 100}%` as `${number}%`,
                        opacity: pct >= 0 ? 1 : 0.35,
                      },
                    ]}
                  />
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={cancel} activeOpacity={0.8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {phase === 'done' && result && (
              <View style={styles.doneBox}>
                <View style={styles.doneHead}>
                  <View style={[styles.doneBadge, { backgroundColor: `${meta.from}26` }]}>
                    <CheckIcon size={16} color={meta.from} />
                  </View>
                  <View style={styles.doneText}>
                    <Text style={styles.doneTitle}>Saved as a new file</Text>
                    <Text style={styles.doneName} numberOfLines={1}>
                      {result.name}
                    </Text>
                    <Text style={styles.doneSize}>
                      {[
                        result.inBytes ? formatFileSize(result.inBytes) : '',
                        result.outBytes ? formatFileSize(result.outBytes) : '',
                      ]
                        .filter(Boolean)
                        .join('  →  ')}
                      {savedPct !== null && savedPct > 0 ? `  ·  ${savedPct}% smaller` : ''}
                    </Text>
                  </View>
                </View>
                {result.savedElsewhere ? (
                  <Text style={styles.noteSmall}>
                    The original's folder is read-only, so this was saved in the app's own library folder.
                  </Text>
                ) : null}
                <View style={styles.doneActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={share} activeOpacity={0.8}>
                    <ShareIcon size={16} color="#fff" />
                    <Text style={styles.secondaryText}>Share</Text>
                  </TouchableOpacity>
                  <Pressable
                    style={[styles.doneBtn, { backgroundColor: meta.from }]}
                    onPress={onClose}
                    accessibilityRole="button"
                  >
                    <Text style={styles.doneBtnText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
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
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
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

  preview: {
    height: 230,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  title: { marginTop: 16, fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#fff' },
  sub: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.4)' },

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
  blockedText: { flex: 1, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.85)' },

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
  blurb: { marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  panel: { marginTop: 20, gap: 20 },
  panelLocked: { opacity: 0.45 },

  fieldLabel: {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
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
  chipDisabled: { opacity: 0.3 },
  chipTitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  chipTitleActive: { color: '#fff' },
  chipSub: { marginTop: 1, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.4)' },

  presetRow: { flexDirection: 'row', gap: 8 },
  preset: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  presetName: { fontSize: 12, fontWeight: '600', color: '#fff' },
  presetSub: { marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.4)' },

  note: { fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.45)' },
  noteStrong: { fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  noteSmall: { fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,0.35)' },
  noteWarn: { color: 'rgba(252,211,77,0.85)' },

  sizeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  sizeCardWarn: {
    borderColor: 'rgba(251,191,36,0.30)',
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  sizeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sizeKey: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  sizeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  sizeValueWarn: { color: 'rgba(252,211,77,0.95)' },
  sizeNote: { fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,0.4)' },

  summary: {
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
  summaryDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  summaryKey: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    fontVariant: ['tabular-nums'],
  },

  infoRow: { marginTop: 24, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 11, lineHeight: 17, color: 'rgba(255,255,255,0.35)' },

  footer: { paddingHorizontal: 20, paddingTop: 12 },
  footerFade: { position: 'absolute', top: -28, left: 0, right: 0, height: 28 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.85)' },

  actionBtn: {
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  runBox: { gap: 10 },
  runTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  runLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  runLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
  runPct: { fontSize: 13, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  runTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  runFill: { height: '100%', borderRadius: 3 },
  cancelBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cancelText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  doneBox: { gap: 12 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { flex: 1, minWidth: 0 },
  doneTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  doneName: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  doneSize: { marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  doneActions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  secondaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  doneBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

export default LibraryEditor;
