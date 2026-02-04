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
  Dimensions
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreen, LibraryScreen, SplashScreen, OnboardingScreen } from './src/screens';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from './src/theme';
import { HomeIcon, LibraryIcon, DownloadIcon } from './src/components/Icons';

// Safe Storage Wrapper
let AppStorage = {
  getItem: async (key: string) => null,
  setItem: async (key: string, value: string) => { },
};
try {
  const AS = require('@react-native-async-storage/async-storage').default;
  if (AS) AppStorage = AS;
} catch (e) {
  console.warn('AsyncStorage not found, persistence disabled');
}

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
  const fadeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.1 : 1,
        tension: 200,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: isActive ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.tabIconContainer,
          { transform: [{ scale: scaleAnim }] }
        ]}
      >
        {isActive ? (
          <View style={styles.activeIconBg}>
            {activeIcon}
          </View>
        ) : (
          icon
        )}
      </Animated.View>
      <Animated.Text
        style={[
          styles.tabLabel,
          isActive && styles.tabLabelActive,
          {
            opacity: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1]
            })
          }
        ]}
      >
        {label}
      </Animated.Text>
    </TouchableOpacity>
  );
};

function App(): React.JSX.Element {
  const [appState, setAppState] = useState<'splash' | 'onboarding' | 'main'>('splash');
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const storageChecked = useRef(false);

  // Check storage on mount - only once
  useEffect(() => {
    if (!storageChecked.current) {
      storageChecked.current = true;
      AppStorage.getItem('hasLaunched')
        .then((value: string | null) => {
          setIsFirstLaunch(value === null);
        })
        .catch(() => {
          // If storage fails, assume not first launch to avoid annoying users
          setIsFirstLaunch(false);
        });
    }
  }, []);

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
      await AppStorage.setItem('hasLaunched', 'true');
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

      <View style={[styles.container, { display: appState === 'main' ? 'flex' : 'none' }]}>
        <View style={styles.screenContainer}>
          <Animated.View
            style={[
              styles.screenWrapper,
              { transform: [{ translateX: slideAnim }] }
            ]}
          >
            <View style={styles.screen}>
              <HomeScreen />
            </View>

            <View style={styles.screen}>
              <LibraryScreen />
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
                activeIcon={<DownloadIcon size={24} color={Colors.primary} />}
                isActive={activeTab === 'home'}
                onPress={() => setActiveTab('home')}
              />

              <TabButton
                id="library"
                label="Library"
                icon={<LibraryIcon size={24} color={Colors.textMuted} />}
                activeIcon={<LibraryIcon size={24} color={Colors.primary} />}
                isActive={activeTab === 'library'}
                onPress={() => setActiveTab('library')}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
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
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomNav: {
    backgroundColor: Colors.surface,
    height: 75,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingVertical: Spacing.xs,
  },
  tabIconContainer: {
    marginBottom: 2,
  },
  activeIconBg: {
    backgroundColor: `${Colors.primary}20`,
    borderRadius: 18, // Squircle shape
    padding: 12,
  },
  tabLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.medium,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: Typography.weights.semibold,
  },
});

export default App;
