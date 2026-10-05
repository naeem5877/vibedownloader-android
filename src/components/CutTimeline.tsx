import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';

interface CutTimelineProps {
  /** Total media duration in seconds. Must be > 0. */
  duration: number;
  /** Selected in-point in seconds. */
  start: number;
  /** Selected out-point in seconds. */
  end: number;
  onChange: (start: number, end: number) => void;
}

/** Shortest clip the user can select, mirroring the desktop app's MIN_GAP. */
export const CUT_MIN_GAP = 0.2;

/**
 * Half-width of a handle's grab zone, in pixels.
 *
 * This is deliberately a pixel distance instead of a duration. A time-based
 * radius collapses on long media: on a 350px track holding a 10 minute video,
 * half a second is under one pixel, so the handle becomes impossible to catch
 * with a finger. A fixed pixel radius stays grabbable at any duration.
 */
const HANDLE_HIT_PX = 28;

/** Finger travel, in px, past which a press is treated as a drag, not a tap. */
const TAP_SLOP_PX = 6;

/**
 * Keeps the handles away from the edge of the screen.
 *
 * Android reserves a strip along the edge for the system back gesture, so a
 * handle parked at x=0 is unreadable *and* its drag is stolen by back
 * navigation. Insetting the whole timeline keeps every grab point inside the
 * safe area instead of relying on the system to behave.
 */
const EDGE_SAFE_PADDING = 14;

const WAVEFORM_BARS = 56;

const TRACK_HEIGHT = 66;

/**
 * The knobs sit proud of the track top and bottom, like a real editor's trim
 * handles, so they read as something to grab and are not clipped by the track's
 * own rounded corners when parked at 0% or 100%.
 */
// Visual handle is intentionally small; the invisible hit zone stays large
// enough for a finger so precision does not come at the cost of usability.
const KNOB_WIDTH = 10;
const KNOB_HEIGHT = 44;

/** Ridges drawn inside each knob, mirroring Premiere/CapCut trim grips. */
const GRIP_COUNT = 3;
const GRIP_RIDGE_WIDTH = 2;

/** Nudge steps offered under the track, in seconds. */
const NUDGE_STEPS = [-1, -0.1, 0.1, 1];

const BUBBLE_WIDTH = 68;

/** Handles are a neutral tool colour; the accent is reserved for the live state. */
const KNOB_BODY = '#F1F5F9';
const KNOB_RIDGE = 'rgba(15, 23, 42, 0.45)';

/** Monospaced digits stop the timestamps from jittering while a value changes. */
const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/** `1:05.5`, matching the one-decimal precision the desktop timeline shows. */
export function formatCutTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toFixed(1)}`;
}

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Deterministic pseudo-waveform. A real waveform needs audio decoding, which is
 * not worth it here, so this fakes a stable silhouette that depends only on the
 * bar index: it reads as audio without pretending to analyse the real track.
 */
const WAVEFORM = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
  const a = Math.sin(i * 1.7) * 0.5 + 0.5;
  const b = Math.sin(i * 0.43 + 1.2) * 0.5 + 0.5;
  const c = Math.sin(i * 3.1 + 0.4) * 0.5 + 0.5;
  return 0.25 + (a * 0.4 + b * 0.35 + c * 0.25) * 0.75;
});

interface Grab {
  target: 'start' | 'end' | 'span';
  /** Finger position when the gesture began, in track pixels. */
  originX: number;
  /**
   * For a span drag, how far into the selection the finger grabbed, in
   * seconds. Without this the clip snaps its start to the finger on touch.
   */
  offsetSec: number;
  /** Selection when the gesture began. */
  base: { start: number; end: number };
  /** Whether the finger has travelled far enough to count as a drag. */
  moved: boolean;
}

/**
 * Dual-handle trim track for picking an in/out point.
 *
 * Drag a handle to move it, drag inside the selection to shift the whole clip,
 * or tap the track to snap the nearer handle there. Handles cannot cross and
 * always leave at least [CUT_MIN_GAP] between them.
 *
 * The gesture reads every input through refs and the responder is created once,
 * so a re-render mid-drag cannot swap the handlers out from under an active
 * touch.
 */
export const CutTimeline: React.FC<CutTimelineProps> = ({
  duration,
  start,
  end,
  onChange,
}) => {
  const total = Number.isFinite(duration) && duration > 0 ? duration : 1;

  const trackWidthRef = useRef(0);
  // The parent state updates a frame behind the finger, so the selection is
  // mirrored locally while dragging to keep handles under the touch.
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  // Which handle the finger owns, so its knob can highlight and the readout
  // can follow it instead of the user guessing which one moved.
  const [active, setActive] = useState<'start' | 'end' | null>(null);
  const grabRef = useRef<Grab | null>(null);
  const grabbedRef = useRef(false);
  const releaseSwipeLockRef = useRef<(() => void) | null>(null);

  // Live mirrors of the props. The responder is built once, so it cannot close
  // over changing values directly and must read them through these.
  const durationRef = useRef(total);
  const startRef = useRef(start);
  const endRef = useRef(end);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    durationRef.current = total;
  }, [total]);
  useEffect(() => {
    startRef.current = start;
    endRef.current = end;
  }, [start, end]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /** Selection as the user currently sees it, from props or the local drag. */
  const readRange = useCallback(
    (): { start: number; end: number } => ({
      start: startRef.current,
      end: endRef.current,
    }),
    [],
  );

  /**
   * Clamps an in/out pair into bounds while guaranteeing the minimum gap by
   * moving the out-point, which keeps whatever in-point the user just set.
   */
  const applyRange = useCallback((nextStart: number, nextEnd: number) => {
    const d = durationRef.current;
    const s = clamp(nextStart, 0, Math.max(0, d - CUT_MIN_GAP));
    // A clip may not be shorter than the minimum gap, but enforcing that
    // on media shorter than the gap itself would push the out-point past
    // the end of the media, so sub-gap media just uses the whole duration.
    const minEnd = d < CUT_MIN_GAP ? 0 : s + CUT_MIN_GAP;
    const e = clamp(nextEnd, minEnd, d);
    onChangeRef.current(s, e);
    return { start: s, end: e };
  }, []);

  const xToTime = useCallback((x: number) => {
    const width = trackWidthRef.current || 1;
    return clamp((x / width) * durationRef.current, 0, durationRef.current);
  }, []);

  /** Decides what a touch grabbed: a handle, the selected span, or a bar. */
  const resolveTarget = useCallback(
    (x: number): Grab['target'] => {
      const width = trackWidthRef.current || 1;
      const scale = width / durationRef.current;
      const { start: s, end: e } = readRange();
      const startX = s * scale;
      const endX = e * scale;

      // Never let the two zones overlap, so a touch between two very close
      // handles still resolves to exactly one of them.
      const radius = Math.min(
        HANDLE_HIT_PX,
        Math.max(8, Math.abs(endX - startX) / 2),
      );

      const dStart = Math.abs(x - startX);
      const dEnd = Math.abs(x - endX);

      if (dStart <= radius && dStart <= dEnd) return 'start';
      if (dEnd <= radius) return 'end';
      if (x > startX && x < endX) return 'span';
      return x - startX <= endX - x ? 'start' : 'end';
    },
    [readRange],
  );

  const finishDrag = useCallback(() => {
    grabRef.current = null;
    grabbedRef.current = false;
    releaseSwipeLockRef.current?.();
    releaseSwipeLockRef.current = null;
    setActive(null);
    setDrag(null);
  }, []);

  // Never leave the tab swipe disabled if the timeline unmounts mid-drag.
  useEffect(
    () => () => {
      releaseSwipeLockRef.current?.();
      releaseSwipeLockRef.current = null;
    },
    [],
  );

  // Built once and reused for the component's lifetime. Recreating a
  // PanResponder on every render detaches the live handlers mid-gesture, which
  // is what made the drag feel dead.
  const panHandlersRef = useRef<
    ReturnType<typeof PanResponder.create>['panHandlers'] | null
  >(null);
  if (panHandlersRef.current === null) {
    panHandlersRef.current = PanResponder.create({
      // The timeline must own the initial touch. Waiting for horizontal
      // movement lets the parent ScrollView win the responder negotiation on
      // Android, which means the handle never receives a grant/move pair.
      // This wrapper is only the timeline area, so owning this touch does not
      // interfere with scrolling the rest of the sheet.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      /**
       * Once a handle is genuinely being dragged, nothing may take the
       * gesture away. Yielding here is what let Android's edge-swipe back
       * navigation swallow a trim that started near the left edge.
       * Before real movement happens the sheet's ScrollView still wins, so
       * a vertical swipe across the track keeps scrolling.
       */
      onPanResponderTerminationRequest: () => {
        const grab = grabRef.current;
        return !(grab && grab.moved);
      },
      // Block the native responder for as long as the finger is on the
      // track, which is React Native's equivalent of `touch-action: none`.
      onShouldBlockNativeResponder: () => grabbedRef.current,
      onPanResponderGrant: evt => {
        const originX = evt.nativeEvent.locationX;
        const base = readRange();
        const target = resolveTarget(originX);

        const handleTime = target === 'start' ? base.start : base.end;
        // Preserve exactly where inside the handle the finger landed.
        // Without this offset, grabbing the edge of the handle makes the
        // selection jump by a few pixels (often close to a second).
        const touchTime = xToTime(originX);
        grabRef.current = {
          target,
          originX,
          offsetSec:
            target === 'span' ? touchTime - base.start : touchTime - handleTime,
          base,
          moved: false,
        };
        grabbedRef.current = true;
        // Stop the Download <-> Library swipe from claiming this drag.
        releaseSwipeLockRef.current?.();
        releaseSwipeLockRef.current = acquireTabSwipeLock();
        setActive(target === 'span' ? null : target);

        // Do not snap a handle on touch-down. The finger can land anywhere
        // inside its hit zone, and snapping here causes the value to jump
        // before the first move. Keep the exact starting range until the
        // finger actually moves, then apply the preserved touch offset.
        setDrag(base);
      },
      onPanResponderMove: (_evt, gesture) => {
        const grab = grabRef.current;
        if (!grab) return;
        if (Math.abs(gesture.dx) > TAP_SLOP_PX) grab.moved = true;

        // locationX is unreliable once the finger leaves the track, so
        // track the gesture delta from where the drag began instead.
        const x = grab.originX + gesture.dx;
        const t = xToTime(x);

        let next: { start: number; end: number };
        if (grab.target === 'start') {
          const adjusted = t - grab.offsetSec;
          next = {
            start: Math.min(adjusted, grab.base.end - CUT_MIN_GAP),
            end: grab.base.end,
          };
        } else if (grab.target === 'end') {
          const adjusted = t - grab.offsetSec;
          next = {
            start: grab.base.start,
            end: Math.max(adjusted, grab.base.start + CUT_MIN_GAP),
          };
        } else {
          const len = grab.base.end - grab.base.start;
          const newStart = clamp(
            xToTime(x) - grab.offsetSec,
            0,
            Math.max(0, durationRef.current - len),
          );
          next = { start: newStart, end: newStart + len };
        }

        setDrag(applyRange(next.start, next.end));
      },
      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
    }).panHandlers;
  }
  const panHandlers = panHandlersRef.current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  // Pull the selection back inside bounds if the duration changes underneath.
  useEffect(() => {
    const d = durationRef.current;
    if (end > d || start < 0 || end - start < CUT_MIN_GAP) {
      const s = clamp(start, 0, Math.max(0, d - CUT_MIN_GAP));
      const minEnd = d < CUT_MIN_GAP ? 0 : s + CUT_MIN_GAP;
      onChangeRef.current(s, clamp(end, minEnd, d));
    }
  }, [total, start, end]);

  /** Steps one handle by a small delta, for points a drag cannot hit exactly. */
  const nudge = useCallback(
    (which: 'start' | 'end', delta: number) => {
      if (which === 'start') {
        const next = clamp(start + delta, 0, end - CUT_MIN_GAP);
        applyRange(next, end);
      } else {
        const next = clamp(
          end + delta,
          start + CUT_MIN_GAP,
          durationRef.current,
        );
        applyRange(start, next);
      }
    },
    [start, end, applyRange],
  );

  const shown = drag ?? { start, end };
  const leftPct = clamp((shown.start / total) * 100, 0, 100);
  const widthPct = clamp(((shown.end - shown.start) / total) * 100, 0, 100);

  /**
   * Where the floating readout sits.
   *
   * The bubble is centred on the active handle, then its left edge is clamped
   * so the whole bubble stays inside the track. Clamping the centre instead
   * would let a handle parked at 100% push half the bubble off-screen.
   */
  const trackWidth = trackWidthRef.current;
  const bubblePct = active === 'end' ? leftPct + widthPct : leftPct;
  const bubbleWidth = Math.min(
    BUBBLE_WIDTH,
    trackWidth > 0 ? trackWidth : BUBBLE_WIDTH,
  );
  const bubbleLeftPct = (() => {
    if (trackWidth <= 0) return 0;
    const anchorPx = (bubblePct / 100) * trackWidth;
    const leftPx = clamp(
      anchorPx - bubbleWidth / 2,
      0,
      Math.max(0, trackWidth - bubbleWidth),
    );
    return (leftPx / trackWidth) * 100;
  })();

  return (
    <View style={styles.container}>
      {/* The wrapper owns a generous invisible touch area while the visible
                handles stay slim and centered directly over the waveform. */}
      <View style={styles.wrap} onLayout={onLayout} {...panHandlers}>
        <View style={styles.track} pointerEvents="none">
          <View style={styles.waveform}>
            {WAVEFORM.map((h, i) => {
              const barTime = ((i + 0.5) / WAVEFORM_BARS) * total;
              const inSelection =
                barTime >= shown.start && barTime <= shown.end;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: `${Math.round(h * 100)}%` },
                    inSelection ? styles.barSelected : styles.barDimmed,
                  ]}
                />
              );
            })}
          </View>

          {/* Translucent tint over the kept region. The dimming is done
                        per bar with opacity rather than a black overlay, so the
                        waveform stays legible on both sides of the cut. */}
          <View
            style={[
              styles.selection,
              { left: `${leftPct}%`, width: `${widthPct}%` },
            ]}
          />
        </View>

        {/* Small precision handles are centered on the waveform. */}
        <View
          style={[
            styles.knob,
            { left: `${leftPct}%` },
            active === 'start' && styles.knobActive,
          ]}
          pointerEvents="none"
        >
          {Array.from({ length: GRIP_COUNT }, (_, g) => (
            <View key={g} style={styles.grip} />
          ))}
        </View>
        <View
          style={[
            styles.knob,
            { left: `${leftPct + widthPct}%` },
            active === 'end' && styles.knobActive,
          ]}
          pointerEvents="none"
        >
          {Array.from({ length: GRIP_COUNT }, (_, g) => (
            <View key={g} style={styles.grip} />
          ))}
        </View>

        {/* Readout follows the handle the finger owns, which is what
                    makes a trim land on an exact time rather than a guess. */}
        {active && (
          <View
            style={[
              styles.bubble,
              { left: `${bubbleLeftPct}%`, width: bubbleWidth },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.bubbleText}>
              {formatCutTime(active === 'start' ? shown.start : shown.end)}
            </Text>
          </View>
        )}
      </View>

      <TimeReadout
        start={shown.start}
        end={shown.end}
        clipLength={shown.end - shown.start}
      />

      <View style={styles.nudgeRow}>
        <Stepper label="Start" onStep={delta => nudge('start', delta)} />
        <Stepper label="End" onStep={delta => nudge('end', delta)} />
      </View>
    </View>
  );
};

/**
 * In/out readouts with the clip length between them.
 *
 * The two timestamps sit under their own handle because that is where the eye
 * already is; the mono face keeps the digits from shifting as the value
 * changes during a drag.
 */
const TimeReadout: React.FC<{
  start: number;
  end: number;
  clipLength: number;
}> = ({ start, end, clipLength }) => (
  <View style={styles.timeRow}>
    <Text style={styles.time}>{formatCutTime(start)}</Text>
    <Text style={styles.clipLength}>{formatCutTime(clipLength)} clip</Text>
    <Text style={[styles.time, styles.timeEnd]}>{formatCutTime(end)}</Text>
  </View>
);

const Stepper: React.FC<{ label: string; onStep: (delta: number) => void }> = ({
  label,
  onStep,
}) => (
  <View style={styles.nudgeGroup}>
    <Text style={styles.nudgeLabel}>{label}</Text>
    <View style={styles.nudgeButtons}>
      {NUDGE_STEPS.map(delta => {
        const seconds = Math.abs(delta);
        const text = `${delta > 0 ? '+' : '-'}${
          Number.isInteger(seconds) ? seconds : seconds.toFixed(1)
        }s`;
        return (
          <TouchableOpacity
            key={String(delta)}
            accessibilityRole="button"
            accessibilityLabel={`Move ${label} ${text}`}
            onPress={() => onStep(delta)}
            activeOpacity={0.6}
            style={styles.nudgeBtn}
          >
            <Text style={styles.nudgeBtnText}>{text}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  /**
   * Horizontal inset keeps every grab point clear of the screen edge, which is
   * also the strip Android reserves for its back gesture.
   */
  container: { paddingHorizontal: EDGE_SAFE_PADDING },
  wrap: {
    position: 'relative',
    // Keep the visual handle centered on the waveform. The handle itself is
    // small; only its invisible hit zone is generous for touch accuracy.
    paddingTop: 26,
    paddingBottom: 6,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  waveform: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  bar: { flex: 1, marginHorizontal: 0.5, borderRadius: 2 },
  /** Full-strength accent inside the kept range. */
  barSelected: { backgroundColor: Colors.primary, opacity: 1 },
  /** Dimmed to a third outside it, instead of being blacked out by a mask. */
  barDimmed: { backgroundColor: Colors.primary, opacity: 0.3 },
  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: `${Colors.primary}1A`,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.primary,
  },
  /**
   * A slim bar rather than a chunky pill: the body is a neutral off-white and
   * the accent is reserved for the live drag state, so the handle reads as a
   * precision tool and stays legible over the waveform.
   */
  knob: {
    position: 'absolute',
    top: 26 + (TRACK_HEIGHT - KNOB_HEIGHT) / 2,
    width: KNOB_WIDTH,
    height: KNOB_HEIGHT,
    marginLeft: -KNOB_WIDTH / 2,
    borderRadius: 6,
    backgroundColor: KNOB_BODY,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  knobActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  /** Vertical ridges inside the knob, the usual trimmer grip. */
  grip: {
    width: GRIP_RIDGE_WIDTH,
    height: 6,
    borderRadius: 1,
    backgroundColor: KNOB_RIDGE,
    marginHorizontal: 1.5,
  },
  bubble: {
    position: 'absolute',
    // Anchored to the top rather than measured up from the bottom, so the
    // gap to the knob does not shift with font metrics.
    top: 0,
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.textPrimary,
  },
  bubbleText: {
    fontFamily: MONO,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingHorizontal: 2,
  },
  time: {
    fontFamily: MONO,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  timeEnd: { textAlign: 'right' },
  clipLength: {
    fontFamily: MONO,
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    opacity: 0.8,
  },
  nudgeRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  nudgeGroup: { flex: 1, gap: Spacing.xs },
  nudgeLabel: {
    fontSize: Typography.sizes.xxs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.medium,
  },
  nudgeButtons: { flexDirection: 'row', gap: Spacing.xs },
  nudgeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nudgeBtnText: {
    fontFamily: MONO,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textSecondary,
  },
});
