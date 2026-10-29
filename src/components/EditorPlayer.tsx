/**
 * EditorPlayer - the preview inside the library editor.
 *
 * Normally it is a plain video with the system transport controls. On the GIF
 * tab it becomes a muted loop of the chosen range with no controls, so what you
 * see is what the GIF will be; the range is drawn on a thin progress bar.
 *
 * The desktop editor draws its own control bar over an HTML <video>. Here the
 * native controls of react-native-video do that job, so only the GIF loop and
 * its range bar are custom.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Video, { type OnProgressData, type VideoRef } from 'react-native-video';
import { VideoIcon } from './Icons';

export interface GifRange {
  start: number;
  length: number;
}

interface EditorPlayerProps {
  /** Absolute path of the video file. */
  path: string;
  poster?: string | null;
  /** When set, the player is in GIF loop-preview mode. */
  gifRange?: GifRange | null;
  /** Known duration in seconds, used to place the range bar before metadata loads. */
  fallbackDuration?: number;
  accent?: string;
}

/** How far before the range start we tolerate the playhead before snapping back. */
const LOOP_SLACK = 0.3;

export const EditorPlayer: React.FC<EditorPlayerProps> = ({
  path,
  poster,
  gifRange,
  fallbackDuration = 0,
  accent = '#d946ef',
}) => {
  const videoRef = useRef<VideoRef>(null);
  const [duration, setDuration] = useState(fallbackDuration);
  const [time, setTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const gif = !!gifRange;
  const rangeStart = gifRange?.start ?? 0;
  const rangeLength = gifRange?.length ?? 0;

  // Jump to the start of the range whenever it moves, so the loop restarts
  // where the user just dragged to instead of finishing the old window first.
  useEffect(() => {
    if (!gif) return;
    videoRef.current?.seek(rangeStart);
  }, [gif, rangeStart, rangeLength]);

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      setTime(data.currentTime);
      if (!gif) return;
      if (
        data.currentTime >= rangeStart + rangeLength ||
        data.currentTime < rangeStart - LOOP_SLACK
      ) {
        videoRef.current?.seek(rangeStart);
      }
    },
    [gif, rangeStart, rangeLength],
  );

  const pct = (n: number) =>
    duration > 0 ? `${Math.min(100, Math.max(0, (n / duration) * 100))}%` : '0%';

  return (
    <View style={styles.wrap}>
      <Video
        ref={videoRef}
        source={{ uri: `file://${path}` }}
        poster={poster ?? undefined}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        // Paused until asked: the editor opens on a still frame, and only the
        // GIF tab plays by itself. In normal mode the native controls drive
        // playback, which is why this prop is not tied to any state.
        paused={!gif}
        muted={gif}
        controls={!gif}
        progressUpdateInterval={gif ? 80 : 250}
        onLoad={d => {
          if (d.duration > 0) setDuration(d.duration);
          setError(null);
          if (gif) videoRef.current?.seek(rangeStart);
        }}
        onProgress={handleProgress}
        onError={e =>
          setError(e?.error?.errorString ?? 'This video could not be played on this device')
        }
      />

      {error ? (
        <View style={styles.errorOverlay} pointerEvents="none">
          <VideoIcon size={36} color="rgba(255,255,255,0.45)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {gif ? (
        <>
          <View style={styles.loopBadge} pointerEvents="none">
            <View style={[styles.loopDot, { backgroundColor: accent }]} />
            <Text style={styles.loopText}>LOOP PREVIEW</Text>
          </View>
          <View style={styles.barWrap} pointerEvents="none">
            <View style={styles.bar}>
              <View
                style={[
                  styles.barRange,
                  {
                    backgroundColor: `${accent}73`,
                    left: pct(rangeStart) as `${number}%`,
                    width: pct(rangeLength) as `${number}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.barPlayed,
                  { backgroundColor: accent, width: pct(time) as `${number}%` },
                ]}
              />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  errorText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  loopBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loopDot: { width: 6, height: 6, borderRadius: 3 },
  loopText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  barWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    height: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  barRange: { position: 'absolute', top: 0, bottom: 0 },
  barPlayed: { position: 'absolute', top: 0, bottom: 0, left: 0, opacity: 0.9 },
});
