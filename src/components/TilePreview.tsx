/**
 * Gallery-style live preview for a library video tile.
 *
 * Plays the first few seconds muted and looped with react-native-video
 * (Android ExoPlayer, hardware decoded). The poster stays visible underneath
 * and the video only fades in once its first frame is ready, so there is no
 * black flash. Mounted for at most a couple of tiles at a time by the parent,
 * because low-end phones only have a few hardware decoders.
 */
import React, { memo, useRef, useSyncExternalStore } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Video, { type OnProgressData, type VideoRef } from 'react-native-video';

const LOOP_SECONDS = 5;

interface Props {
  path: string;
}

const TilePreview: React.FC<Props> = ({ path }) => {
  const ref = useRef<VideoRef>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const handleProgress = (p: OnProgressData) => {
    if (p.currentTime >= LOOP_SECONDS) ref.current?.seek(0);
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <Video
        ref={ref}
        source={{ uri: `file://${path}` }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        muted
        repeat
        controls={false}
        disableFocus
        playInBackground={false}
        progressUpdateInterval={500}
        onProgress={handleProgress}
        onReadyForDisplay={() =>
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }).start()
        }
        bufferConfig={{
          minBufferMs: 1500,
          maxBufferMs: 4000,
          bufferForPlaybackMs: 500,
          bufferForPlaybackAfterRebufferMs: 1000,
        }}
        onError={() => {}}
      />
    </Animated.View>
  );
};

const MemoTilePreview = memo(TilePreview);
export default MemoTilePreview;

/**
 * Decides which tiles may play, OUTSIDE React state. Scrolling and viewability
 * change constantly; keeping them in useState re-rendered the whole Library
 * screen and every tile. Here only the tiles whose answer flips re-render.
 */
const SCROLL_SETTLE_MS = 160;

export class PreviewGate {
  private paths: string[] = [];
  private scrolling = false;
  private blocked = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit() {
    this.listeners.forEach(l => l());
  }

  isPlaying = (path: string) =>
    !this.scrolling && !this.blocked && this.paths.includes(path);

  setViewable(next: string[]) {
    if (
      next.length === this.paths.length &&
      next.every((p, i) => p === this.paths[i])
    ) {
      return;
    }
    this.paths = next;
    this.emit();
  }

  setBlocked(blocked: boolean) {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    this.emit();
  }

  scrollStart = () => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.scrolling) {
      this.scrolling = true;
      this.emit();
    }
  };

  // Debounced so drag-release followed by momentum doesn't flicker a decoder
  // on and off between the two events.
  scrollEnd = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.scrolling) {
        this.scrolling = false;
        this.emit();
      }
    }, SCROLL_SETTLE_MS);
  };

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}

/** Renders nothing until the gate says this tile should play. */
const LiveTilePreviewBase: React.FC<{ gate: PreviewGate; path: string }> = ({
  gate,
  path,
}) => {
  const playing = useSyncExternalStore(gate.subscribe, () =>
    gate.isPlaying(path),
  );
  return playing ? <MemoTilePreview path={path} /> : null;
};

export const LiveTilePreview = memo(LiveTilePreviewBase);
