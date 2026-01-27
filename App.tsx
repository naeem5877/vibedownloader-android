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
import { HomeScreen, LibraryScreen } from './src/screens';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from './src/theme';
import { HomeIcon, LibraryIcon, DownloadIcon } from './src/components/Icons';

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
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === 'home' ? 0 : -width,
      tension: 50,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
        translucent={false}
      />
      <View style={styles.container}>
        {/* Screen Container */}
        <View style={styles.screenContainer}>
          <Animated.View
            style={[
              styles.screenWrapper,
              { transform: [{ translateX: slideAnim }] }
            ]}
          >
            {/* Home Screen */}
            <View style={styles.screen}>
              <HomeScreen />
            </View>

            {/* Library Screen */}
            <View style={styles.screen}>
              <LibraryScreen />
            </View>
          </Animated.View>
        </View>

        {/* Bottom Navigation */}
        <SafeAreaView edges={['bottom']} style={styles.bottomNavSafeArea}>
          <View style={styles.bottomNav}>
            <View style={styles.navContent}>
              <TabButton
                id="home"
                label="Download"
                icon={<DownloadIcon size={24} color={Colors.textMuted} />}
                activeIcon={<DownloadIcon size={22} color={Colors.textPrimary} />}
                isActive={activeTab === 'home'}
                onPress={() => setActiveTab('home')}
              />

              <TabButton
                id="library"
                label="Library"
                icon={<LibraryIcon size={24} color={Colors.textMuted} />}
                activeIcon={<LibraryIcon size={22} color={Colors.textPrimary} />}
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
  },
  bottomNav: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    ...Shadows.lg,
  },
  navContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    minWidth: 80,
  },
  tabIconContainer: {
    marginBottom: Spacing.xs,
  },
  activeIconBg: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.round,
    padding: Spacing.sm,
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
