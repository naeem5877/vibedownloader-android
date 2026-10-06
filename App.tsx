/**
 * VibeDownloader Mobile
 * Android-only React Native app for downloading media from multiple platforms
 *
 * @format
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Pressable,
  Animated,
  Dimensions,
  PanResponder,
  Easing,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HomeScreen,
  LibraryScreen,
  SplashScreen,
  OnboardingScreen,
} from './src/screens';
import {
  Colors,
  BorderRadius,
  Spacing,
  Typography,
  Shadows,
} from './src/theme';
import { HomeIcon, LibraryIcon, DownloadIcon } from './src/components/Icons';
import { UpdateLog } from './src/components/UpdateLog';
import { Haptics } from './src/utils/haptics';
import { isTabSwipeLocked } from './src/utils/tabSwipeLock';
// Sentry is initialized in index.js to avoid duplicate initialization and
// to keep configuration in a single place.

// Storage key constant
const ONBOARDING_COMPLETE_KEY = 'hasLaunched';

const { width } = Dimensions.get('window');

type TabType = 'home' | 'library';

interface TabButtonProps {
  id: TabType;
  label: string;
  icon: React.JSX.Element;
  activeIcon: React.JSX.Element;
  isActive: boolean;
  onPress: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({
  label,
  icon,
  activeIcon,
  isActive,
  onPress,
}) => {
  // One value drives the pill, the icon crossfade and the label together, so the
  // button reads as a single movement rather than three independent ones.
  const selected = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  // Kept separate from `selected` so a press dip can play without cancelling the
  // selection animation that is already running.
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(selected, {
      toValue: isActive ? 1 : 0,
      tension: 240,
      friction: 20,
      useNativeDriver: true,
    }).start();
  }, [isActive, selected]);

  const dip = (toValue: number) => {
    Animated.spring(press, {
      toValue,
      // Stiff and almost undamped, so the dip snaps back the instant it is
      // released instead of drifting back over the top.
      tension: 420,
      friction: 16,
      useNativeDriver: true,
    }).start();
  };

  const fadeIn = selected;
  const fadeOut = selected.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <Pressable
      style={styles.tabButton}
      onPress={() => {
        Haptics.selection();
        onPress();
      }}
      onPressIn={() => dip(0.9)}
      onPressOut={() => dip(1)}
    >
      <Animated.View
        style={[
          styles.tabInner,
          {
            transform: [
              {
                scale: Animated.multiply(
                  selected.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                  press,
                ),
              },
            ],
          },
        ]}
      >
        {/* Rounded highlight pill behind the active tab */}
        <Animated.View
          style={[
            styles.activePill,
            {
              opacity: fadeIn,
              // Grows out from the middle as it appears, rather than only fading.
              transform: [
                {
                  scale: selected.interpolate({
                    inputRange: [0, 0.6, 1],
                    outputRange: [0.72, 1.04, 1],
                  }),
                },
              ],
            },
          ]}
        />

        <View style={styles.tabContent}>
          {/* Both icons are stacked and crossfaded; swapping one for the other
              used to make the glyph blink. */}
          <View style={styles.iconSlot}>
            <Animated.View style={[styles.iconLayer, { opacity: fadeOut }]}>
              {icon}
            </Animated.View>
            <Animated.View style={[styles.iconLayer, { opacity: fadeIn }]}>
              {activeIcon}
            </Animated.View>
          </View>

          {/* The label is always mounted and always occupies the same slot, so
              switching tabs no longer resizes the pill and re-centres the icon.
              Two copies are stacked because `color` cannot be animated by the
              native module. */}
          <View style={styles.labelSlot}>
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                styles.tabLabelDim,
                {
                  opacity: fadeOut,
                  transform: [
                    {
                      translateY: fadeIn.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -3],
                      }),
                    },
                  ],
                },
              ]}
            >
              {label}
            </Animated.Text>
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                {
                  opacity: fadeIn,
                  transform: [
                    {
                      translateY: fadeIn.interpolate({
                        inputRange: [0, 1],
                        outputRange: [3, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {label}
            </Animated.Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

function App(): React.JSX.Element {
  // The splash is an overlay, not a screen the app waits behind. The real UI
  // mounts underneath it while it plays (its animations run on the native
  // driver, so the heavy first mount does not stutter them) and it leaves only
  // once that is done. Unmounting the splash first and then mounting Home and
  // Library is what used to leave a blank black screen for a few seconds.
  const [splashDone, setSplashDone] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const appState: 'loading' | 'onboarding' | 'main' =
    isFirstLaunch === null ? 'loading' : isFirstLaunch ? 'onboarding' : 'main';
  const isFirstLaunchRef = useRef<boolean | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const storageChecked = useRef(false);

  // Ref to track active tab for PanResponder
  const activeTabRef = useRef(activeTab);

  // Check storage on mount - only once
  useEffect(() => {
    if (!storageChecked.current) {
      storageChecked.current = true;
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
        .then((value: string | null) => {
          setIsFirstLaunch(value === null);
          isFirstLaunchRef.current = value === null;
        })
        .catch(() => {
          // If storage fails, assume not first launch to avoid annoying users
          setIsFirstLaunch(false);
          isFirstLaunchRef.current = false;
        });
    }
  }, []);

  // Sync activeTabRef
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // If storage never answers, do not leave the splash waiting on it forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (isFirstLaunchRef.current === null) {
        isFirstLaunchRef.current = false;
        setIsFirstLaunch(false);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  // The UI under the splash counts as ready once it has mounted and had two
  // frames to lay out. (InteractionManager is not usable here: the splash's
  // own looping animation would keep it waiting.)
  useEffect(() => {
    if (appState === 'loading' || contentReady) return;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!cancelled) setContentReady(true);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [appState, contentReady]);

  // Resting position of each tab. A drag may only ever land on one of these two.
  const restX = (tab: TabType) => (tab === 'home' ? 0 : -width);

  // Where the current drag began, so movement is measured from the finger's
  // starting point rather than from a fixed origin.
  const dragBase = useRef(0);

  /**
   * Snap to a tab.
   *
   * A short eased timing, not a spring: the old tension-50 spring was soft
   * enough to wobble and overshoot, which read as lag right after a flick.
   */
  const animateToTab = useCallback(
    (tab: TabType) => {
      Animated.timing(slideAnim, {
        toValue: restX(tab),
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [slideAnim],
  );

  // Swiping between tabs. The content tracks the finger 1:1 and only commits to
  // a tab on release, so the movement feels attached to the hand rather than
  // being a jump that happens after the fact.
  const panResponder = useRef(
    PanResponder.create({
      // Capture phase, and deliberately a low threshold: the old 20px dead zone
      // meant short swipes were swallowed by the child ScrollView and the
      // gesture only ever felt like "nothing happened, then it jumped".
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // A sheet or trim handle that needs horizontal drags for itself has
        // asked the tab swipe to stand down (see tabSwipeLock).
        if (isTabSwipeLocked()) return false;
        const { dx, dy } = gestureState;
        // Clearly horizontal, so a vertical scroll is never hijacked.
        return Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy);
      },
      // Once we own the gesture, do not let a child ScrollView take it back
      // mid-swipe and strand the screen half way across.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // Freeze any snap still in flight so it cannot fight the finger.
        slideAnim.stopAnimation();
        dragBase.current = restX(activeTabRef.current);
      },
      onPanResponderMove: (_, gestureState) => {
        const raw = dragBase.current + gestureState.dx;
        // Rubber-band past either edge instead of hitting a hard wall, which
        // is what made the swipe feel like it had got stuck.
        let next: number;
        if (raw > 0) {
          next = raw * 0.25;
        } else if (raw < -width) {
          next = -width + (raw + width) * 0.25;
        } else {
          next = raw;
        }
        slideAnim.setValue(next);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const from = activeTabRef.current;
        // A fast flick counts even when it is short, and a slow deliberate
        // drag has to cross a quarter of the screen.
        const flicked = Math.abs(vx) > 0.35;
        const dragged = Math.abs(dx) > width * 0.25;

        const target: TabType =
          flicked || dragged ? (dx < 0 ? 'library' : 'home') : from;

        // Animate first so the snap starts on this frame instead of waiting
        // for the re-render that setActiveTab schedules.
        animateToTab(target);
        if (target !== from) {
          Haptics.selection();
          activeTabRef.current = target;
          setActiveTab(target);
        }
      },
      // A gesture stolen back by the system (a modal opening, a call coming in)
      // should settle back rather than leave the screen parked mid-swipe.
      onPanResponderTerminate: () => animateToTab(activeTabRef.current),
    }),
  ).current;

  // Tab animation
  useEffect(() => {
    animateToTab(activeTab);
  }, [activeTab, animateToTab]);

  // Per-screen visuals derived from the same slide value as the drag, so the
  // cross-fade and depth effect track the finger exactly. clamp keeps the
  // rubber-band overscroll from pushing opacity/scale out of range.
  const homeStyle = {
    opacity: slideAnim.interpolate({
      inputRange: [-width, -width * 0.55, 0],
      outputRange: [0, 0.25, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        scale: slideAnim.interpolate({
          inputRange: [-width, 0],
          outputRange: [0.92, 1],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  };
  const libraryStyle = {
    opacity: slideAnim.interpolate({
      inputRange: [-width, -width * 0.45, 0],
      outputRange: [1, 0.25, 0],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        scale: slideAnim.interpolate({
          inputRange: [-width, 0],
          outputRange: [1, 0.92],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  };

  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  const handleOnboardingDone = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
      await AsyncStorage.setItem('last_seen_version', '1.2.0');
    } catch (e) {
      console.warn('Failed to save launch state:', e);
    }
    // appState is derived from this, so it also switches onboarding -> main.
    setIsFirstLaunch(false);
    isFirstLaunchRef.current = false;
  };

  return (
    <SafeAreaProvider style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
        translucent={false}
      />

      {appState === 'onboarding' && (
        <OnboardingScreen onDone={handleOnboardingDone} />
      )}

      {appState === 'main' && (
        <View style={styles.container}>
          <View style={styles.screenContainer} {...panResponder.panHandlers}>
            <Animated.View
              style={[
                styles.screenWrapper,
                { transform: [{ translateX: slideAnim }] },
              ]}
            >
              <Animated.View style={[styles.screen, homeStyle]}>
                <HomeScreen
                  onNavigateToLibrary={() => setActiveTab('library')}
                />
              </Animated.View>

              <Animated.View style={[styles.screen, libraryStyle]}>
                <LibraryScreen isFocused={activeTab === 'library'} />
              </Animated.View>
            </Animated.View>
          </View>

          <SafeAreaView edges={['bottom']} style={styles.bottomNavSafeArea}>
            <View style={styles.bottomNav}>
              <View style={styles.navContent}>
                <TabButton
                  id="home"
                  label="Download"
                  icon={<DownloadIcon size={24} color={Colors.textMuted} />}
                  activeIcon={
                    <DownloadIcon size={24} color={Colors.primaryLight} />
                  }
                  isActive={activeTab === 'home'}
                  onPress={() => setActiveTab('home')}
                />

                <TabButton
                  id="library"
                  label="Library"
                  icon={<LibraryIcon size={24} color={Colors.textMuted} />}
                  activeIcon={
                    <LibraryIcon size={24} color={Colors.primaryLight} />
                  }
                  isActive={activeTab === 'library'}
                  onPress={() => setActiveTab('library')}
                />
              </View>
            </View>
          </SafeAreaView>

          {/* Update Log Modal. A Modal is its own native window, so it would
              draw over the splash overlay if it opened early. */}
          {splashDone && <UpdateLog />}
        </View>
      )}

      {/* Splash overlay: last child, so it sits on top of whatever is mounting.
          zIndex/elevation are explicit because Onboarding's header has its own
          zIndex and would otherwise draw over the splash on Android. */}
      {!splashDone && (
        <View style={styles.splashOverlay}>
          <SplashScreen ready={contentReady} onFinish={handleSplashFinish} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Same colour as the native launch window, so nothing can flash a different
  // shade of black while screens mount.
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#0A0A0C',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screenWrapper: {
    flexDirection: 'row',
    width: width * 2,
    flex: 1,
  },
  screen: {
    width,
    flex: 1,
  },
  bottomNavSafeArea: {
    // Float over the screens so the rounded corners show the content
    // behind them instead of the black container background.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#15151A',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  bottomNav: {
    backgroundColor: 'transparent',
    paddingTop: 12,
    paddingBottom: 10,
  },
  navContent: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    minWidth: 56,
    paddingHorizontal: 18,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Fixed-size wrappers so the icon and label occupy the same footprint in
  // both states. Letting them size to the active state made the pill change
  // width and the icon jump sideways on every tab change.
  iconSlot: {
    width: 24,
    height: 24,
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    width: 66,
    height: 18,
    justifyContent: 'center',
  },
  tabLabel: {
    ...StyleSheet.absoluteFillObject,
    fontSize: 14,
    color: Colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tabLabelDim: {
    color: Colors.textMuted,
  },
});

export default App;
