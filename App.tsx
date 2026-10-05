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
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
  Easing,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeScreen, LibraryScreen, SplashScreen, OnboardingScreen } from './src/screens';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from './src/theme';
import { HomeIcon, LibraryIcon, DownloadIcon } from './src/components/Icons';
import { UpdateLog } from './src/components/UpdateLog';
import { Haptics } from './src/utils/haptics';

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

const TabButton: React.FC<TabButtonProps> = ({ label, icon, activeIcon, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0.94)).current;
  const pillAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1 : 0.94,
        tension: 280,
        friction: 18,
        useNativeDriver: true,
      }),
      Animated.timing(pillAnim, {
        toValue: isActive ? 1 : 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={() => {
        Haptics.selection();
        onPress();
      }}
      activeOpacity={0.85}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: scaleAnim }] }]}>
        {/* Rounded highlight pill behind the active tab */}
        <Animated.View style={[styles.activePill, { opacity: pillAnim }]} />

        <View style={styles.tabContent}>
          {isActive ? activeIcon : icon}
          {isActive && (
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                {
                  opacity: pillAnim,
                  transform: [
                    {
                      translateX: pillAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {label}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

function App(): React.JSX.Element {
  const [appState, setAppState] = useState<'splash' | 'onboarding' | 'main'>('splash');
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
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
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [slideAnim]
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
          activeTabRef.current = target;
          setActiveTab(target);
        }
      },
      // A gesture stolen back by the system (a modal opening, a call coming in)
      // should settle back rather than leave the screen parked mid-swipe.
      onPanResponderTerminate: () => animateToTab(activeTabRef.current),
    })
  ).current;

  // Tab animation
  useEffect(() => {
    animateToTab(activeTab);
  }, [activeTab, animateToTab]);

  const handleSplashFinish = () => {
    // If storage hasn't been checked yet, wait a bit more
    if (isFirstLaunchRef.current === null) {
      // Retry after a short delay
      const retryTimer = setInterval(() => {
        if (isFirstLaunchRef.current !== null) {
          clearInterval(retryTimer);
          setAppState(isFirstLaunchRef.current ? 'onboarding' : 'main');
        }
      }, 100);
      // Fallback after 2 seconds
      setTimeout(() => {
        clearInterval(retryTimer);
        if (isFirstLaunchRef.current === null) {
          setAppState('main'); // Default to main if storage check fails
        }
      }, 2000);
      return;
    }
    setAppState(isFirstLaunchRef.current ? 'onboarding' : 'main');
  };

  const handleOnboardingDone = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
      await AsyncStorage.setItem('last_seen_version', '1.2.0');
    } catch (e) {
      console.warn('Failed to save launch state:', e);
    }
    setIsFirstLaunch(false);
    isFirstLaunchRef.current = false;
    setAppState('main');
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
        translucent={false}
      />

      {appState === 'splash' && <SplashScreen onFinish={handleSplashFinish} />}

      {appState === 'onboarding' && <OnboardingScreen onDone={handleOnboardingDone} />}

      {appState === 'main' && (
        <View style={styles.container}>
          <View style={styles.screenContainer} {...panResponder.panHandlers}>
            <Animated.View
              style={[
                styles.screenWrapper,
                { transform: [{ translateX: slideAnim }] }
              ]}
            >
              <View style={styles.screen}>
                <HomeScreen onNavigateToLibrary={() => setActiveTab('library')} />
              </View>

              <View style={styles.screen}>
                <LibraryScreen isFocused={activeTab === 'library'} />
              </View>
            </Animated.View>
          </View>

          <SafeAreaView edges={['bottom']} style={styles.bottomNavSafeArea}>
            <View style={styles.bottomNav}>
              <View style={styles.navContent}>
                <TabButton
                  id="home"
                  label="Download"
                  icon={<DownloadIcon size={24} color={Colors.textMuted} />}
                  activeIcon={<DownloadIcon size={24} color={Colors.primaryLight} />}
                  isActive={activeTab === 'home'}
                  onPress={() => setActiveTab('home')}
                />

                <TabButton
                  id="library"
                  label="Library"
                  icon={<LibraryIcon size={24} color={Colors.textMuted} />}
                  activeIcon={<LibraryIcon size={24} color={Colors.primaryLight} />}
                  isActive={activeTab === 'library'}
                  onPress={() => setActiveTab('library')}
                />
              </View>
            </View>
          </SafeAreaView>

          {/* Update Log Modal */}
          <UpdateLog />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
  tabLabel: {
    fontSize: 14,
    color: Colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default App;
