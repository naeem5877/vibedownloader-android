import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Animated,
    Image,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, getPlatformColor } from '../theme';
import { DownloadIcon, VideoIcon, LibraryIcon, ChevronRightIcon } from '../components/Icons';
import { Haptics } from '../utils/haptics';

const { width } = Dimensions.get('window');

interface Slide {
    id: string;
    title: string;
    description: string;
    accent: string;
    icon: (color: string) => React.ReactElement;
    chips: { label: string; dot?: string }[];
}

const SLIDES: Slide[] = [
    {
        id: 'sources',
        title: 'Save videos from anywhere',
        description: 'YouTube, Instagram, TikTok, Facebook, X and more, all in one app.',
        accent: Colors.primary,
        icon: (c) => <VideoIcon size={40} color={c} />,
        chips: [
            { label: 'YouTube', dot: getPlatformColor('YouTube') },
            { label: 'Instagram', dot: getPlatformColor('Instagram') },
            { label: 'TikTok', dot: getPlatformColor('TikTok') },
            { label: 'Facebook', dot: getPlatformColor('Facebook') },
            { label: 'X', dot: getPlatformColor('X') },
            { label: 'Spotify', dot: getPlatformColor('Spotify') },
        ],
    },
    {
        id: 'paste',
        title: 'Paste a link, pick a quality',
        description: 'Download the best quality in one tap, or choose the resolution, audio only, or just a clip.',
        accent: Colors.secondary,
        icon: (c) => <DownloadIcon size={40} color={c} />,
        chips: [
            { label: 'Quick download' },
            { label: 'MP3 & WAV' },
            { label: 'Cut clips' },
            { label: 'Batch' },
        ],
    },
    {
        id: 'library',
        title: 'Yours to keep',
        description: 'No account needed. Files save straight to your device and your library keeps them organised.',
        accent: Colors.success,
        icon: (c) => <LibraryIcon size={40} color={c} />,
        chips: [
            { label: 'No sign-in' },
            { label: 'On your device' },
            { label: 'Open source' },
        ],
    },
];

interface OnboardingProps {
    onDone: () => void;
}

const OnboardingScreen: React.FC<OnboardingProps> = ({ onDone }) => {
    const insets = useSafeAreaInsets();
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const listRef = useRef<any>(null);

    const isLast = currentIndex === SLIDES.length - 1;

    const goToNext = useCallback(() => {
        Haptics.impact();
        if (!isLast) {
            const next = currentIndex + 1;
            setCurrentIndex(next);
            listRef.current?.scrollToIndex({ index: next, animated: true });
        } else {
            onDone();
        }
    }, [currentIndex, isLast, onDone]);

    const handleSkip = useCallback(() => {
        Haptics.selection();
        onDone();
    }, [onDone]);

    const inputRange = SLIDES.map((_, i) => i * width);
    const accentColor = scrollX.interpolate({
        inputRange,
        outputRange: SLIDES.map((s) => s.accent),
        extrapolate: 'clamp',
    });
    // The same colour at low alpha, for the soft glow behind the content.
    const glowColor = scrollX.interpolate({
        inputRange,
        outputRange: SLIDES.map((s) => `${s.accent}26`),
        extrapolate: 'clamp',
    });

    const renderItem = ({ item, index }: { item: Slide; index: number }) => {
        const range = [(index - 1) * width, index * width, (index + 1) * width];
        const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
        const translateX = scrollX.interpolate({
            inputRange: range,
            outputRange: [width * 0.25, 0, -width * 0.25],
            extrapolate: 'clamp',
        });
        const heroScale = scrollX.interpolate({ inputRange: range, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });

        return (
            <View style={styles.slide}>
                <Animated.View style={[styles.hero, { opacity, transform: [{ scale: heroScale }] }]}>
                    <View style={[styles.ringOuter, { borderColor: `${item.accent}22` }]} />
                    <View style={[styles.ringInner, { borderColor: `${item.accent}33`, backgroundColor: `${item.accent}12` }]} />
                    <View style={[styles.iconTile, { backgroundColor: `${item.accent}24`, borderColor: `${item.accent}55` }]}>
                        {item.icon(item.accent)}
                    </View>
                </Animated.View>

                <Animated.View style={[styles.copy, { opacity, transform: [{ translateX }] }]}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>

                    <View style={styles.chips}>
                        {item.chips.map((chip) => (
                            <View key={chip.label} style={styles.chip}>
                                {chip.dot && <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />}
                                <Text style={styles.chipText}>{chip.label}</Text>
                            </View>
                        ))}
                    </View>
                </Animated.View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Soft glow that follows the current slide's accent */}
            <Animated.View style={[styles.glow, { backgroundColor: glowColor }]} />

            {/* Top bar */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <View style={styles.brandRow}>
                    <Image
                        source={require('../../transparent_logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.brand}>VibeDownloader</Text>
                </View>
                <TouchableOpacity
                    onPress={handleSkip}
                    style={[styles.skipBtn, isLast && styles.skipHidden]}
                    disabled={isLast}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Skip introduction"
                >
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
            </View>

            <Animated.FlatList
                ref={listRef}
                data={SLIDES}
                horizontal
                pagingEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                    useNativeDriver: false,
                })}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                    if (index !== currentIndex) {
                        setCurrentIndex(index);
                        Haptics.selection();
                    }
                }}
                getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                style={styles.list}
            />

            {/* Footer */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                <View style={styles.pagination}>
                    {SLIDES.map((_, index) => {
                        const range = [(index - 1) * width, index * width, (index + 1) * width];
                        const dotWidth = scrollX.interpolate({ inputRange: range, outputRange: [8, 24, 8], extrapolate: 'clamp' });
                        const dotOpacity = scrollX.interpolate({ inputRange: range, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
                        return (
                            <Animated.View
                                key={index}
                                style={[styles.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: accentColor }]}
                            />
                        );
                    })}
                </View>

                <TouchableOpacity onPress={goToNext} activeOpacity={0.85}>
                    <Animated.View style={[styles.primaryBtn, { backgroundColor: accentColor }]}>
                        <Text style={styles.primaryBtnText}>{isLast ? 'Get started' : 'Continue'}</Text>
                        <ChevronRightIcon size={18} color="#fff" />
                    </Animated.View>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0C',
    },
    glow: {
        position: 'absolute',
        width: width * 1.4,
        height: width * 1.4,
        borderRadius: width,
        top: -width * 0.35,
        alignSelf: 'center',
    },
    header: {
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 34, height: 34 },
    brand: {
        fontSize: 17,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        letterSpacing: -0.2,
    },
    skipBtn: { paddingVertical: 6, paddingHorizontal: 4 },
    skipHidden: { opacity: 0 },
    skipText: {
        fontSize: 15,
        fontWeight: Typography.weights.semibold,
        color: Colors.textSecondary,
    },

    list: { flex: 1 },
    slide: {
        width,
        flex: 1,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },

    hero: {
        width: 220,
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 36,
    },
    ringOuter: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        borderWidth: 1,
    },
    ringInner: {
        position: 'absolute',
        width: 156,
        height: 156,
        borderRadius: 78,
        borderWidth: 1,
    },
    iconTile: {
        width: 92,
        height: 92,
        borderRadius: 28,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    copy: { alignItems: 'center', width: '100%' },
    title: {
        fontSize: 28,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        textAlign: 'center',
        letterSpacing: -0.5,
        lineHeight: 34,
        marginBottom: 12,
    },
    description: {
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },

    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginTop: 28,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    chipDot: { width: 7, height: 7, borderRadius: 4 },
    chipText: {
        fontSize: 13,
        fontWeight: Typography.weights.medium,
        color: Colors.textPrimary,
    },

    footer: { paddingHorizontal: 24 },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginBottom: 24,
    },
    dot: { height: 8, borderRadius: 4 },
    primaryBtn: {
        height: 56,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    primaryBtnText: {
        fontSize: 16,
        fontWeight: Typography.weights.bold,
        color: '#fff',
        letterSpacing: 0.2,
    },
});

export default OnboardingScreen;
