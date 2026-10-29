/**
 * GifRangePicker - choose the moment a GIF is made from.
 *
 * Two separate jobs, two separate controls:
 *   - WHERE: a filmstrip of the whole video with one marker on it. Hold the
 *     marker (or anywhere on the strip) and drag to move the clip. The marker
 *     has no handles to fiddle with; it only slides.
 *   - HOW LONG: a plain slider, 1 s up to `maxLength`.
 * Under them, a START box you hold and drag sideways for fine control.
 *
 * Everything is clamped here, so the editor never has to repair an
 * out-of-range value.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { YtDlpNative } from '../native/YtDlpModule';
import { Haptics } from '../utils/haptics';

interface GifRangePickerProps {
  /** Video file, used to pull the filmstrip frames. */
  path: string;
  /** Video length in seconds. */
  duration: number;
  start: number;
  length: number;
  /** Longest GIF allowed, in seconds. */
  maxLength: number;
  accent: string;
  /** Poster frame, shown across the strip while (or if) real frames are unavailable. */
  poster?: string | null;
  onChange: (start: number, length: number) => void;
}

const MIN_LENGTH = 1;
const SLIDER_STEP = 0.5;
const FRAME_COUNT = 10;
const TRACK_HEIGHT = 72;
/** The marker never draws narrower than this, so a short clip stays visible and grabbable. */
const MARKER_MIN_W = 30;
const SIDE_PAD = 16;
const THUMB = 30;
const SLIDER_PAD = THUMB / 2 + 2;
const LENGTH_TICKS = [1, 2, 3, 5, 8, 10, 15];
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];
const FINE_STEP = 0.1;
/** Ruler ticks between 0 and the end; a multiple of the axis gaps so tall ticks line up with the labels. */
const RULER_TICKS = 40;
const CHIP_W = 64;
const AXIS_W = 36;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `1:05.5`, seconds padded so the readout does not jitter. */
function clock(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** `1:05`, for the axis where tenths are noise. */
function tick(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export const GifRangePicker: React.FC<GifRangePickerProps> = ({
  path,
  duration,
  start,
  length,
  maxLength,
  accent,
  poster,
  onChange,
}) => {
  const [frames, setFrames] = useState<string[]>([]);
  const [trackW, setTrackW] = useState(0);
  const [dragging, setDragging] = useState(false);

  const live = useRef({ duration, start, length, trackW, onChange });
  live.current = { duration, start, length, trackW, onChange };
  const from = useRef(0);

  const lenCap = Math.max(0.5, Math.min(maxLength, duration));
  const lenMin = Math.min(MIN_LENGTH, lenCap);

  useEffect(() => {
    let cancelled = false;
    setFrames([]);
    // Optional call: an app build from before this method existed has no such
    // native function, and the strip should then just show its placeholders.
    if (__DEV__ && typeof YtDlpNative.getVideoFrames !== 'function') {
      console.warn(
        'GifRangePicker: native getVideoFrames is missing. The installed app is older than the source, so rebuild it (npx react-native run-android) to get real frames.',
      );
    }
    Promise.resolve(YtDlpNative.getVideoFrames?.(path, FRAME_COUNT))
      .then(f => {
        if (!cancelled && Array.isArray(f)) setFrames(f);
      })
      .catch(e => {
        if (__DEV__) console.warn('GifRangePicker: getVideoFrames failed', e);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Hold anywhere on the strip and drag: the clip moves by the distance the
  // finger travels. Nothing jumps on a tap.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The editor sits in a ScrollView; once the marker is held it keeps the gesture.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          from.current = live.current.start;
          setDragging(true);
          Haptics.selection();
        },
        onPanResponderMove: (_e, g) => {
          const { duration: d, length: l, trackW: w, onChange: cb } = live.current;
          if (w <= 0 || d <= 0) return;
          const ns = round1(clamp(from.current + (g.dx / w) * d, 0, Math.max(0, d - l)));
          cb(ns, l);
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  );

  const hasFrames = frames.some(Boolean);
  const w = trackW;
  const end = start + length;
  const trueLeft = duration > 0 ? (start / duration) * w : 0;
  const trueW = duration > 0 ? (length / duration) * w : 0;
  const markW = Math.max(MARKER_MIN_W, trueW);
  const markLeft = clamp(trueLeft + trueW / 2 - markW / 2, 0, Math.max(0, w - markW));

  const setLength = (next: number) => {
    const l = round1(clamp(next, lenMin, lenCap));
    onChange(round1(clamp(start, 0, Math.max(0, duration - l))), l);
  };
  const setStart = (next: number) => {
    onChange(round1(clamp(next, 0, Math.max(0, duration - length))), length);
  };

  return (
    <View>
      {/* Readout */}
      <View style={[styles.readout, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]}>
        <View style={styles.readCol}>
          <Text style={styles.readLabel}>START</Text>
          <Text style={[styles.readValue, { color: accent }]}>{clock(start)}</Text>
        </View>
        <View style={styles.readMid}>
          <View style={[styles.readLine, { backgroundColor: `${accent}66` }]} />
          <View style={[styles.readLenPill, { backgroundColor: accent }]}>
            <Text style={styles.readLenText}>{length.toFixed(1)}s</Text>
          </View>
          <View style={[styles.readLine, { backgroundColor: `${accent}66` }]} />
        </View>
        <View style={[styles.readCol, styles.readColRight]}>
          <Text style={styles.readLabel}>END</Text>
          <Text style={[styles.readValue, { color: accent }]}>{clock(end)}</Text>
        </View>
      </View>

      {/* WHERE: filmstrip with one sliding marker */}
      <Text style={styles.label}>POSITION</Text>
      <View style={styles.stripOuter} {...pan.panHandlers}>
        <View style={styles.track} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
          {/* Everything inside the rounded track is clipped to its corners */}
          <View style={styles.clip} pointerEvents="none">
          {/* Backdrop: real frames when we have them, else the poster, else a soft tint */}
          <View style={styles.frames} pointerEvents="none">
            {hasFrames ? (
              Array.from({ length: FRAME_COUNT }, (_, i) =>
                frames[i] ? (
                  <Image key={i} source={{ uri: frames[i] }} style={styles.frame} resizeMode="cover" />
                ) : (
                  <View key={i} style={[styles.frame, styles.framePlaceholder]} />
                ),
              )
            ) : poster ? (
              <>
                <Image source={{ uri: poster }} style={styles.posterFill} resizeMode="cover" blurRadius={6} />
                <View style={styles.posterShade} />
              </>
            ) : (
              <View style={[styles.posterFill, { backgroundColor: `${accent}14` }]} />
            )}
          </View>

          {/* Ruler: a tick every 2.5 % of the video, a tall one at each time label */}
          <View style={styles.ruler} pointerEvents="none">
            {Array.from({ length: RULER_TICKS - 1 }, (_, k) => {
              // Skip the two edge ticks: they sit on the border and poke out of the rounded corners.
              const i = k + 1;
              const major = i % (RULER_TICKS / (AXIS_TICKS.length - 1)) === 0;
              return (
                <View
                  key={i}
                  style={[
                    styles.rulerTick,
                    {
                      left: `${(i / RULER_TICKS) * 100}%` as `${number}%`,
                      height: major ? 14 : 7,
                      opacity: major ? 0.55 : 0.28,
                    },
                  ]}
                />
              );
            })}
          </View>

          {w > 0 && (
            <>
              <View style={[styles.dim, { left: 0, width: markLeft }]} />
              <View style={[styles.dim, { left: markLeft + markW, right: 0 }]} />
            </>
          )}
          </View>

          {w > 0 && (
            <>

              {/* The clip marker: accent frame, soft glow, grip dots */}
              <View
                pointerEvents="none"
                style={[
                  styles.marker,
                  {
                    left: markLeft,
                    width: markW,
                    borderColor: accent,
                    backgroundColor: `${accent}${dragging ? '45' : '2B'}`,
                    shadowColor: accent,
                    shadowOpacity: dragging ? 0.95 : 0.55,
                    transform: [{ scaleY: dragging ? 1.06 : 1 }],
                  },
                ]}
              >
                <View style={styles.grip}>
                  <View style={styles.gripDot} />
                  <View style={styles.gripDot} />
                  <View style={styles.gripDot} />
                </View>
              </View>

              {/* Time chip with a stem down to the marker; solid accent while held */}
              <View
                pointerEvents="none"
                style={[
                  styles.chipWrap,
                  {
                    left: clamp(
                      markLeft + markW / 2 - CHIP_W / 2,
                      -SIDE_PAD + 4,
                      Math.max(0, w - CHIP_W + SIDE_PAD - 4),
                    ),
                  },
                ]}
              >
                <View
                  style={[
                    styles.timeChip,
                    dragging
                      ? { backgroundColor: accent, borderColor: accent }
                      : { borderColor: `${accent}99` },
                  ]}
                >
                  <Text style={styles.timeChipText}>{clock(start)}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Time labels, centred under the tall ruler ticks */}
      <View style={styles.axis}>
        {w > 0 &&
          AXIS_TICKS.map(t => (
            <Text
              key={t}
              style={[styles.axisText, { left: clamp(t * w - AXIS_W / 2, -8, w - AXIS_W + 8) }]}
            >
              {tick(duration * t)}
            </Text>
          ))}
      </View>
      <Text style={styles.hint}>Hold the marker and drag to choose where the GIF starts</Text>

      {/* HOW LONG: a slider */}
      <LengthSlider
        value={clamp(length, lenMin, lenCap)}
        min={lenMin}
        max={lenCap}
        accent={accent}
        onChange={setLength}
      />

      {/* Fine tune the start */}
      <Text style={styles.label}>FINE TUNE START</Text>
      <ScrubField value={clock(start)} base={start} accent={accent} onScrub={setStart} />
      <Text style={styles.endNote}>Hold the box and drag left or right. Drag farther to go faster.</Text>
    </View>
  );
};

/* ------------------------------------------------------------ length slider */

function LengthSlider({
  value,
  min,
  max,
  accent,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  accent: string;
  onChange: (v: number) => void;
}) {
  const [w, setW] = useState(0);
  const [held, setHeld] = useState(false);
  const boxRef = useRef<View>(null);
  const boxX = useRef(0);
  const lastTick = useRef(value);

  const live = useRef({ min, max, w, onChange });
  live.current = { min, max, w, onChange };

  const apply = (pageX: number) => {
    const { min: lo, max: hi, w: width, onChange: cb } = live.current;
    const usable = width - SLIDER_PAD * 2;
    if (usable <= 0 || hi <= lo) return;
    const f = clamp((pageX - boxX.current - SLIDER_PAD) / usable, 0, 1);
    const v = clamp(Math.round((lo + f * (hi - lo)) / SLIDER_STEP) * SLIDER_STEP, lo, hi);
    cb(round1(v));
    if (v !== lastTick.current) {
      lastTick.current = v;
      Haptics.selection();
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
          setHeld(true);
          const pageX = e.nativeEvent.pageX;
          // Re-measure: the sheet may still have been sliding in at layout time.
          boxRef.current?.measureInWindow(x => {
            boxX.current = x;
            apply(pageX);
          });
        },
        onPanResponderMove: (_e, g) => apply(g.moveX),
        onPanResponderRelease: () => setHeld(false),
        onPanResponderTerminate: () => setHeld(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const usable = Math.max(0, w - SLIDER_PAD * 2);
  const frac = max > min ? (value - min) / (max - min) : 1;
  const x = SLIDER_PAD + frac * usable;
  const ticks = LENGTH_TICKS.filter(t => t >= min - 1e-6 && t <= max + 1e-6);

  return (
    <View>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>LENGTH</Text>
        <Text style={[styles.sliderValue, { color: accent }]}>{value.toFixed(1)}s</Text>
      </View>

      <View
        ref={boxRef}
        style={styles.sliderBox}
        {...pan.panHandlers}
        onLayout={e => {
          setW(e.nativeEvent.layout.width);
          boxRef.current?.measureInWindow(px => {
            boxX.current = px;
          });
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`GIF length ${value.toFixed(1)} seconds`}
      >
        <View style={styles.sliderRail} pointerEvents="none" />
        {w > 0 && (
          <>
            <View
              pointerEvents="none"
              style={[styles.sliderFill, { left: SLIDER_PAD, width: x - SLIDER_PAD, backgroundColor: accent }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: x - THUMB / 2,
                  borderColor: accent,
                  shadowColor: accent,
                  transform: [{ scale: held ? 1.18 : 1 }],
                },
              ]}
            >
              <View style={[styles.thumbDot, { backgroundColor: accent }]} />
            </View>
          </>
        )}
      </View>

      {/* Tick labels line up under the rail */}
      <View style={styles.tickRow} pointerEvents="none">
        {w > 0 &&
          ticks.map(t => {
            const f = max > min ? (t - min) / (max - min) : 0;
            const on = Math.abs(value - t) < 0.26;
            return (
              <Text
                key={t}
                style={[styles.tickText, { left: SLIDER_PAD + f * usable - 12 }, on && { color: '#fff' }]}
              >
                {t}
              </Text>
            );
          })}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- scrub field */

/**
 * Distance dragged -> seconds. Slow drags move in clean 0.1 s steps (about 8 px
 * each); the curve then ramps up so a long sweep can cross a whole song.
 */
function scrubDelta(dx: number): number {
  const steps = Math.pow(Math.abs(dx) / 8, 1.6);
  return Math.sign(dx) * steps * FINE_STEP;
}

/** A value box you hold and drag sideways, like a timeline scrubber. */
function ScrubField({
  value,
  base,
  accent,
  onScrub,
}: {
  value: string;
  /** Current value in seconds. */
  base: number;
  accent: string;
  /** Receives the wanted value in seconds; the parent clamps it. */
  onScrub: (next: number) => void;
}) {
  const [held, setHeld] = useState(false);
  const live = useRef({ base, onScrub });
  live.current = { base, onScrub };
  const from = useRef(0);
  const lastShown = useRef(0);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          from.current = live.current.base;
          lastShown.current = from.current;
          setHeld(true);
          Haptics.selection();
        },
        onPanResponderMove: (_e, g) => {
          const next = round1(from.current + scrubDelta(g.dx));
          live.current.onScrub(next);
          if (Math.abs(next - lastShown.current) >= 0.5) {
            lastShown.current = next;
            Haptics.selection();
          }
        },
        onPanResponderRelease: () => setHeld(false),
        onPanResponderTerminate: () => setHeld(false),
      }),
    [],
  );

  return (
    <View
      {...pan.panHandlers}
      style={[styles.scrub, held && { borderColor: `${accent}AA`, backgroundColor: `${accent}14` }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Start ${value}`}
    >
      <Text style={[styles.scrubArrow, held && { color: accent }]}>‹</Text>
      <Text style={[styles.scrubValue, { color: accent }]}>{value}</Text>
      <Text style={[styles.scrubArrow, held && { color: accent }]}>›</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  /* Readout */
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  readCol: { minWidth: 76 },
  readColRight: { alignItems: 'flex-end' },
  readLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.4)',
  },
  readValue: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  readMid: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  readLine: { flex: 1, height: 2, borderRadius: 1 },
  readLenPill: {
    marginHorizontal: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  readLenText: { fontSize: 11, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },

  label: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },

  /* Strip */
  stripOuter: { paddingHorizontal: SIDE_PAD, paddingTop: 36, paddingBottom: 2 },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  frames: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    borderRadius: 13,
    overflow: 'hidden',
  },
  frame: { flex: 1, height: '100%' },
  framePlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  posterFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  posterShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,10,0.45)' },
  ruler: { ...StyleSheet.absoluteFillObject },
  rulerTick: {
    position: 'absolute',
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: '#fff',
  },
  dim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,10,0.68)',
  },
  // Clips the backdrop, ruler and dim areas to the track's rounded corners.
  clip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 13,
    overflow: 'hidden',
  },
  // Taller than the track and with a small radius: where the track's square
  // edge meets the marker, the marker's side is already straight, so no
  // square corners poke out inside it.
  marker: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    borderWidth: 2.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 8,
  },
  grip: { gap: 4, alignItems: 'center' },
  gripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  chipWrap: { position: 'absolute', top: -34, width: CHIP_W, alignItems: 'center' },
  timeChip: {
    height: 22,
    minWidth: CHIP_W,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  timeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  axis: {
    height: 14,
    marginHorizontal: SIDE_PAD,
    marginTop: 8,
  },
  axisText: {
    position: 'absolute',
    width: AXIS_W,
    textAlign: 'center',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
  },

  /* Length slider */
  sliderHead: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.35)',
  },
  sliderValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sliderBox: { height: 48, justifyContent: 'center', marginTop: 4 },
  sliderRail: {
    position: 'absolute',
    left: SLIDER_PAD,
    right: SLIDER_PAD,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sliderFill: { position: 'absolute', height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 6,
  },
  thumbDot: { width: 10, height: 10, borderRadius: 5 },
  tickRow: { height: 16, marginTop: -2 },
  tickText: {
    position: 'absolute',
    width: 24,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    fontVariant: ['tabular-nums'],
  },

  /* Scrub field */
  scrub: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  scrubArrow: { fontSize: 26, lineHeight: 28, fontWeight: '300', color: 'rgba(255,255,255,0.3)' },
  scrubValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  endNote: { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
});
