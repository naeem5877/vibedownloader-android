/**
 * VibeDownloader Mobile
 * Android-only React Native app for downloading media from multiple platforms
 * 
 * @format
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
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

const TabButton: React.FC<TabButtonProps> = ({ id, label, icon, activeIcon, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const indicatorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.1 : 1,
        tension: 300,
        friction: 15,
        useNativeDriver: true,
      }),
      Animated.timing(indicatorAnim, {
        toValue: isActive ? 1 : 0,
        duration: 200,
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
      activeOpacity={1} // Physical buttons don't fade, they react
    >
      {/* Top indicator bar */}
      <Animated.View
        style={[
          styles.indicator,
          {
            opacity: indicatorAnim,
            backgroundColor: Colors.primary,
            transform: [{ scaleX: indicatorAnim }]
          }
        ]}
      />

      <Animated.View
        style={[
          styles.tabIconContainer,
          {
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        {isActive ? activeIcon : icon}
      </Animated.View>
      <Text
        style={[
          styles.tabLabel,
          isActive && styles.tabLabelActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

function App(): React.JSX.Element {
  const [appState, setAppState] = useState<'splash' | 'onboarding' | 'main'>('splash');
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
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
        })
        .catch(() => {
          // If storage fails, assume not first launch to avoid annoying users
          setIsFirstLaunch(false);
        });
    }
  }, []);

  // Sync activeTabRef
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // PanResponder for swiping
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture horizontal swipes
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        return isHorizontal && Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = 50;
        if (gestureState.dx < -threshold && activeTabRef.current === 'home') {
          setActiveTab('library');
        } else if (gestureState.dx > threshold && activeTabRef.current === 'library') {
          setActiveTab('home');
        }
      },
    })
  ).current;

  // Tab animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === 'home' ? 0 : -width,
      tension: 50,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  const handleSplashFinish = () => {
    // If storage hasn't been checked yet, wait a bit more
    if (isFirstLaunch === null) {
      // Retry after a short delay
      const retryTimer = setInterval(() => {
        if (isFirstLaunch !== null) {
          clearInterval(retryTimer);
          setAppState(isFirstLaunch ? 'onboarding' : 'main');
        }
      }, 100);
      // Fallback after 2 seconds
      setTimeout(() => {
        clearInterval(retryTimer);
        if (isFirstLaunch === null) {
          setAppState('main'); // Default to main if storage check fails
        }
      }, 2000);
      return;
    }
    setAppState(isFirstLaunch ? 'onboarding' : 'main');
  };

  const handleOnboardingDone = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } catch (e) {
      console.warn('Failed to save launch state:', e);
    }
    setIsFirstLaunch(false);
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
                  icon={<DownloadIcon size={22} color={Colors.textMuted} />}
                  activeIcon={<DownloadIcon size={22} color={Colors.primary} />}
                  isActive={activeTab === 'home'}
                  onPress={() => setActiveTab('home')}
                />

                <TabButton
                  id="library"
                  label="Library"
                  icon={<LibraryIcon size={22} color={Colors.textMuted} />}
                  activeIcon={<LibraryIcon size={22} color={Colors.primary} />}
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
    backgroundColor: Colors.surfaceHigh,
  },
  bottomNav: {
    backgroundColor: Colors.surfaceHigh,
    height: 65,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.innerBorder,
  },
  navContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tabIconContainer: {
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: Typography.weights.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: Typography.weights.bold,
  },
  // removed activeDot styles
});

export default App;
