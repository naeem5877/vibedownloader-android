/**
 * VideoInfoCard - the desktop result header: a rounded thumbnail with a small
 * resolution badge (top-left, in the platform colour) and duration badge
 * (bottom-right), then the title, uploader and views, with the save-thumbnail
 * and cut buttons on the right. No outer card.
 *
 * Mirrors the desktop "Single Video/Track Result" block in Downloader.tsx:
 * shimmer sweep + zoom-in on the thumbnail, LIVE badge, optional top-right
 * badge (Spotify album) and the purple Cut & Download action.
 */
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { Colors, getPlatformColor } from '../theme';
import { qualityHeight } from '../utils/resolution';
import { VideoInfo } from '../native/YtDlpModule';
import { formatDuration, formatViewCount } from '../native/YtDlpModule';
import { PlayIcon, ImageIcon, UserIcon, EyeIcon, ScissorsIcon } from './Icons';

interface VideoInfoCardProps {
  videoInfo: VideoInfo;
  onSaveThumbnail?: () => void;
  /** Opens the Cut & Download sheet. The button needs a known duration. */
  onCut?: () => void;
  /** When true, hides the resolution badge (audio streams report 320p etc.) */
  isMusic?: boolean;
  /** Small green pill in the top-right corner (desktop shows the Spotify album). */
  badge?: string;
}

export const VideoInfoCard: React.FC<VideoInfoCardProps> = ({
  videoInfo,
  onSaveThumbnail,
  onCut,
  isMusic = false,
  badge,
}) => {
  const platformColor = getPlatformColor(videoInfo.platform);
  const height = qualityHeight(videoInfo.width, videoInfo.height);
  const isLive = !!videoInfo.isLive;
  // Audio streams falsely report a height (e.g. 320), so music never shows one.
  const hasResolution = height > 0 && !isMusic && !isLive;
  const resolution = height >= 2160 ? '4K' : height >= 1440 ? '2K' : `${height}p`;
  const canCut = !!onCut && videoInfo.duration > 0 && !isLive;

  const [thumbWidth, setThumbWidth] = useState(0);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  const zoom = useRef(new Animated.Value(1.07)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 350, useNativeDriver: true }),
      // Desktop: image eases from 1.07 to 1 over 0.9s.
      Animated.timing(zoom, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Desktop: a skewed white band sweeps across once, 0.12s delay.
      Animated.timing(sweep, {
        toValue: 1,
        duration: 850,
        delay: 120,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise, zoom, sweep]);

  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, livePulse]);

  const sweepX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-thumbWidth * 1.1, thumbWidth * 1.1],
  });
  const sweepOpacity = sweep.interpolate({
    inputRange: [0, 0.05, 0.95, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
      {/* Thumbnail: 16:9 for video, square for album art */}
      <View
        style={[styles.thumbWrap, { aspectRatio: isMusic ? 1 : 16 / 9 }]}
        onLayout={(e) => setThumbWidth(e.nativeEvent.layout.width)}
      >
        {videoInfo.thumbnail ? (
          <Animated.Image
            source={{ uri: videoInfo.thumbnail }}
            style={[styles.thumb, { transform: [{ scale: zoom }] }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <PlayIcon size={44} color={Colors.textMuted} />
          </View>
        )}

        {/* One-shot shimmer sweep */}
        {thumbWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              {
                width: thumbWidth / 3,
                opacity: sweepOpacity,
                transform: [{ translateX: sweepX }, { skewX: '-14deg' }],
              },
            ]}
          />
        )}

        {hasResolution && (
          <View style={styles.resBadge}>
            <Text style={[styles.resText, { color: platformColor }]}>
              {resolution}
            </Text>
          </View>
        )}

        {isLive && (
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {!!badge && (
          <View style={styles.cornerBadge}>
            <Text style={styles.cornerBadgeText} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        )}

        {videoInfo.duration > 0 && (
          <View style={styles.durBadge}>
            <Text style={styles.durText}>{formatDuration(videoInfo.duration)}</Text>
          </View>
        )}
      </View>

      {/* Title + meta, with the thumbnail button on the right */}
      <View style={styles.infoRow}>
        <View style={styles.infoText}>
          <Text style={styles.title} numberOfLines={3}>
            {videoInfo.title}
          </Text>
          <View style={styles.metaRow}>
            {!!videoInfo.uploader && (
              <View style={styles.metaItem}>
                <UserIcon size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {videoInfo.uploader}
                </Text>
              </View>
            )}
            {videoInfo.viewCount > 0 && (
              <View style={styles.metaItem}>
                <EyeIcon size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.metaText}>
                  {formatViewCount(videoInfo.viewCount)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {((onSaveThumbnail && !!videoInfo.thumbnail) || canCut) && (
          <View style={styles.actions}>
            {onSaveThumbnail && !!videoInfo.thumbnail && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onSaveThumbnail}
                activeOpacity={0.75}
                accessibilityLabel="Save thumbnail"
              >
                <ImageIcon size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            )}
            {canCut && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.cutBtn]}
                onPress={onCut}
                activeOpacity={0.75}
                accessibilityLabel="Cut and download a clip"
              >
                <ScissorsIcon size={20} color="#C084FC" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  thumbWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  thumb: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(239,68,68,0.95)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  cornerBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    maxWidth: '55%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(34,197,94,0.9)',
  },
  cornerBadgeText: { fontSize: 12, fontWeight: '600', color: '#000' },
  resBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  resText: { fontSize: 12, fontWeight: '700' },
  durBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  durText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoText: { flex: 1 },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  metaItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 16,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Desktop: bg-purple-500/10 + border-purple-500/20
  cutBtn: {
    backgroundColor: 'rgba(168,85,247,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.20)',
  },
});

export default VideoInfoCard;
