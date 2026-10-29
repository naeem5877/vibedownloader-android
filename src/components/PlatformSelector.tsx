/**
 * PlatformSelector — the active platform expands into an icon + label pill,
 * the rest stay as quiet icon chips. Auto-scrolls to the active one.
 */
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Colors, Spacing, Shadows, getOnPlatformColor } from '../theme';
import { PressScale, Ease } from './Motion';
import {
  YouTubeIcon,
  InstagramIcon,
  TikTokIcon,
  FacebookIcon,
  SpotifyIcon,
  XIcon,
  PinterestIcon,
  SoundCloudIcon,
  TwitchIcon,
} from './Icons';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PlatformSelectorProps {
  selectedPlatform: string | null;
  onSelectPlatform?: (platform: string) => void;
  disabled?: boolean;
}

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', Icon: YouTubeIcon, color: '#FF3B30' },
  { id: 'instagram', label: 'Instagram', Icon: InstagramIcon, color: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', Icon: TikTokIcon, color: '#25F4EE' },
  { id: 'facebook', label: 'Facebook', Icon: FacebookIcon, color: '#3B82F6' },
  { id: 'spotify', label: 'Spotify', Icon: SpotifyIcon, color: '#1ED760' },
  { id: 'x', label: 'X', Icon: XIcon, color: '#FFFFFF' },
  { id: 'twitch', label: 'Twitch', Icon: TwitchIcon, color: '#A970FF' },
  { id: 'pinterest', label: 'Pinterest', Icon: PinterestIcon, color: '#E60023' },
  { id: 'soundcloud', label: 'SoundCloud', Icon: SoundCloudIcon, color: '#FF5500' },
];

const Item: React.FC<{
  platform: (typeof PLATFORMS)[0];
  isSelected: boolean;
  index: number;
  onPress: () => void;
  disabled?: boolean;
  onLayoutX: (x: number) => void;
}> = ({ platform, isSelected, index, onPress, disabled, onLayoutX }) => {
  const sel = useRef(new Animated.Value(isSelected ? 1 : 0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(sel, {
      toValue: isSelected ? 1 : 0,
      duration: 260,
      easing: Ease.out,
      useNativeDriver: false, // colors
    }).start();
  }, [sel, isSelected]);

  // staggered entrance
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 120 + index * 45,
      easing: Ease.out,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const c = platform.color;
  // Desktop look: the active tile is filled with the platform colour (TikTok
  // stays black with its cyan glyph, like the desktop app).
  const fill = platform.id === 'tiktok' ? '#000000' : c;
  const iconOnActive =
    platform.id === 'tiktok' ? c : getOnPlatformColor(fill);
  const bg = sel.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.glassFillStrong, fill],
  });
  const border = sel.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0)', c],
  });
  const scale = sel.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Animated.View
      onLayout={e => onLayoutX(e.nativeEvent.layout.x)}
      style={{
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      <PressScale onPress={onPress} disabled={disabled} scaleTo={0.92} haptic>
        <Animated.View
          style={[
            styles.item,
            {
              backgroundColor: bg,
              borderColor: border,
              transform: [{ scale }],
            },
            isSelected && Shadows.glow(c),
          ]}
        >
          <platform.Icon size={24} color={isSelected ? iconOnActive : c} />
        </Animated.View>
      </PressScale>
    </Animated.View>
  );
};

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
  selectedPlatform,
  onSelectPlatform,
  disabled = false,
}) => {
  const [localSelected, setLocalSelected] = useState(selectedPlatform);
  const scroller = useRef<ScrollView>(null);
  const xs = useRef<Record<string, number>>({});

  const norm = (v: string | null) =>
    v?.toLowerCase() === 'twitter' ? 'x' : v?.toLowerCase();

  useEffect(() => {
    setLocalSelected(selectedPlatform);
  }, [selectedPlatform]);

  // keep the active pill in view (e.g. after link auto-detect)
  useEffect(() => {
    const id = norm(localSelected);
    if (id && xs.current[id] !== undefined) {
      scroller.current?.scrollTo({
        x: Math.max(0, xs.current[id] - Spacing.lg),
        animated: true,
      });
    }
  }, [localSelected]);

  const handleSelect = (id: string) => {
    if (disabled || norm(localSelected) === id) return;
    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, 'easeInEaseOut', 'opacity'),
    );
    setLocalSelected(id);
    onSelectPlatform?.(id);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
      >
        {PLATFORMS.map((p, i) => (
          <Item
            key={p.id}
            platform={p}
            index={i}
            isSelected={norm(localSelected) === p.id}
            onPress={() => handleSelect(p.id)}
            disabled={disabled}
            onLayoutX={x => {
              xs.current[p.id] = x;
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.sm },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 16,
    gap: 12,
    alignItems: 'center',
  },
  item: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PlatformSelector;
