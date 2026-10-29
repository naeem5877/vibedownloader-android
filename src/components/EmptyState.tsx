/**
 * EmptyState - the desktop app's empty state: a hero with a pulsing light and
 * two slowly turning rings, three "how to download" cards, and a
 * "Supported content" card.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, Animated, Easing } from 'react-native';
import { Colors, PlatformThemes } from '../theme';
import {
  SparkleIcon,
  FacebookIcon,
  XIcon,
  YouTubeIcon,
  InstagramIcon,
  TikTokIcon,
  SpotifyIcon,
  PinterestIcon,
  SoundCloudIcon,
  TwitchIcon,
  LinkIcon,
  ClipboardIcon,
  DownloadIcon,
} from './Icons';
import { Reveal } from './Motion';

interface EmptyStateProps {
  platform?: string | null;
  isOffline?: boolean;
  isLoggedIn?: boolean;
  title?: string;
  subtitle?: string;
  support?: string;
  features?: string[];
  icon?: React.ReactNode;
}

type Meta = {
  title: string;
  name: string;
  subtitle: string;
  features: string[];
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  hint?: [string, string]; // [logged out, logged in]
};

const META: Record<string, Meta> = {
  youtube: {
    title: 'YouTube Downloader',
    name: 'YouTube',
    subtitle: 'Shorts, Long Videos & Playlists',
    features: ['🎬 Videos', '🎞️ Shorts', '📋 Playlists', '🎵 Music'],
    Icon: YouTubeIcon,
    color: PlatformThemes.YouTube.primary,
    hint: [
      'Log in for private and age-restricted videos',
      'Private and age-restricted access on',
    ],
  },
  spotify: {
    title: 'Spotify Downloader',
    name: 'Spotify',
    subtitle: 'Music, Lossless & Hi-Res',
    features: ['🎵 Music', '📀 Lossless', '💎 Hi-Res', '📋 Playlists'],
    Icon: SpotifyIcon,
    color: PlatformThemes.Spotify.primary,
  },
  soundcloud: {
    title: 'SoundCloud Downloader',
    name: 'SoundCloud',
    subtitle: 'Tracks & Playlists',
    features: ['🎵 Tracks', '📋 Playlists', '🔥 Artists', '🎧 HQ Stream'],
    Icon: SoundCloudIcon,
    color: PlatformThemes.SoundCloud.primary,
  },
  instagram: {
    title: 'Instagram Downloader',
    name: 'Instagram',
    subtitle: 'Reels, Posts & Stories',
    features: ['🎬 Reels', '📷 Posts', '📖 Stories', '🖼️ Photos'],
    Icon: InstagramIcon,
    color: PlatformThemes.Instagram.primary,
    hint: [
      'Log in and paste a username for stories',
      'Stories and private posts ready',
    ],
  },
  tiktok: {
    title: 'TikTok Downloader',
    name: 'TikTok',
    subtitle: 'Videos & Sounds',
    features: ['🎬 Videos', '🎵 Sounds', '🎥 No Mark', '🚀 Fast'],
    Icon: TikTokIcon,
    color: PlatformThemes.TikTok.primary,
    hint: ['Log in for private videos', 'Private videos ready'],
  },
  facebook: {
    title: 'Facebook Downloader',
    name: 'Facebook',
    subtitle: 'Videos & Stories',
    features: ['📹 Reels', '📖 Stories', '🔒 Private', '⚡ HD'],
    Icon: FacebookIcon,
    color: PlatformThemes.Facebook.primary,
    hint: ['Log in for private videos and stories', 'Private access on'],
  },
  x: {
    title: 'X Downloader',
    name: 'X',
    subtitle: 'Videos & Photos',
    features: ['🎬 4K Video', '🖼️ HD Photos', '🏃 Fast Sync', '📂 GIFs'],
    Icon: XIcon,
    color: '#FFFFFF',
    hint: ['Log in to X for private content', 'Private access on'],
  },
  twitch: {
    title: 'Twitch Downloader',
    name: 'Twitch',
    subtitle: 'Live Streams, VODs & Clips',
    features: ['🔴 Live', '🎬 VODs', '✂️ Clips', '⚡ HD'],
    Icon: TwitchIcon,
    color: PlatformThemes.Twitch.primary,
  },
  pinterest: {
    title: 'Pinterest Downloader',
    name: 'Pinterest',
    subtitle: 'Pins & Videos',
    features: ['📌 Pins', '🎬 Videos', '🖼️ HD', '🎨 Save'],
    Icon: PinterestIcon,
    color: PlatformThemes.Pinterest.primary,
  },
};

const STEP_ICONS = [
  { Icon: LinkIcon, color: '#60A5FA' },
  { Icon: ClipboardIcon, color: '#C084FC' },
  { Icon: DownloadIcon, color: '#4ADE80' },
];

export const EmptyState: React.FC<EmptyStateProps> = ({
  platform,
  isOffline = false,
  isLoggedIn = false,
  title,
  subtitle,
  features,
  icon,
}) => {
  const key =
    (platform || '').toLowerCase() === 'twitter'
      ? 'x'
      : (platform || '').toLowerCase();
  const meta = useMemo<Meta>(
    () =>
      META[key] || {
        title: 'VibeDownloader',
        name: 'any supported site',
        subtitle: 'The Elite Downloader',
        features: ['🎬 Video', '🎵 Audio', '📸 Photos', '📂 Files'],
        Icon: SparkleIcon,
        color: Colors.primary,
      },
    [key],
  );
  const color = meta.color;
  const chips = features || meta.features;

  // Pulsing light + two counter-rotating rings (all native-driven).
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const s = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    p.start();
    s.start();
    return () => {
      p.stop();
      s.stop();
    };
  }, [pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const rotateBack = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const lightOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.05, 0.13],
  });

  const steps: [string, string][] = [
    ['Copy the link', `Copy the media URL from ${meta.name}`],
    ['Paste it above', 'Use the Paste button or manual input'],
    ['Choose & download', 'Select quality and start downloading'],
  ];

  return (
    <View style={styles.container}>
      {/* Hero */}
      <Reveal index={0} style={styles.hero}>
        <View style={styles.display}>
          <Animated.View
            style={[
              styles.light,
              { backgroundColor: color, opacity: lightOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.ringOuter,
              { borderColor: `${color}40`, transform: [{ rotate }] },
            ]}
          />
          <Animated.View
            style={[
              styles.ringInner,
              { borderColor: `${color}55`, transform: [{ rotate: rotateBack }] },
            ]}
          />
          {icon || <meta.Icon size={44} color={color} />}
        </View>
        <Text style={styles.title}>{title || meta.title}</Text>
        <Text style={styles.subtitle}>{subtitle || meta.subtitle}</Text>
      </Reveal>

      {/* How to download */}
      <Reveal index={1} style={styles.steps}>
        <Text style={styles.overline}>HOW TO DOWNLOAD</Text>
        {steps.map(([t, d], i) => {
          const { Icon, color: ic } = STEP_ICONS[i];
          return (
            <View key={t} style={styles.card}>
              <View style={styles.iconBox}>
                <Icon size={20} color={ic} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.stepTitle}>{t}</Text>
                <Text style={styles.stepDesc}>{d}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{i + 1}</Text>
              </View>
            </View>
          );
        })}
      </Reveal>

      {/* Supported content */}
      <Reveal index={2} style={styles.support}>
        <View style={styles.supportHead}>
          <SparkleIcon size={13} color="rgba(250,204,21,0.6)" />
          <Text style={styles.supportLabel}>SUPPORTED CONTENT</Text>
        </View>
        <View style={styles.chips}>
          {chips.map(f => (
            <View key={f} style={styles.chip}>
              <Text style={styles.chipText}>{f}</Text>
            </View>
          ))}
        </View>
        {meta.hint && (
          <View style={styles.hintRow}>
            <View
              style={[
                styles.hintDot,
                { backgroundColor: isLoggedIn ? Colors.success : '#F59E0B' },
              ]}
            />
            <Text style={styles.hintText}>
              {isLoggedIn ? meta.hint[1] : meta.hint[0]}
            </Text>
          </View>
        )}
      </Reveal>

      {isOffline && (
        <Reveal index={3} style={styles.offline}>
          <Text style={styles.offlineText}>You’re offline</Text>
        </Reveal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  hero: { alignItems: 'center', marginBottom: 28 },
  display: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  light: { ...StyleSheet.absoluteFillObject, borderRadius: 64 },
  ringOuter: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 64,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ringInner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 48,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 6,
    textAlign: 'center',
  },

  steps: { marginBottom: 20 },
  overline: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  stepDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.25)',
  },

  support: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  supportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  supportLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.3)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  hintDot: { width: 6, height: 6, borderRadius: 3 },
  hintText: {
    flex: 1,
    fontSize: 10,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.3)',
  },

  offline: {
    marginTop: 24,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${Colors.error}1A`,
  },
  offlineText: { fontSize: 12, color: Colors.errorLight },
});
