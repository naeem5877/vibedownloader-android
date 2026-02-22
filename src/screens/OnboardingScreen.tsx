import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Image, StatusBar, Easing } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { SparkleIcon, DownloadIcon, CheckIcon, MusicIcon, VideoIcon, ImageIcon } from '../components/Icons';
import { ShinyText } from '../components/ShinyText';
import { Haptics } from '../utils/haptics';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'UNIVERSAL ASSET CAPTURE',
        subtitle: 'SYSTEM INITIALIZATION',
        description: 'Multi-threaded extraction for High-Definition media across 50+ global platforms.',
        icon: <VideoIcon size={48} color={Colors.primary} />,
        technical: 'EXTRACTION ENGINE v2.4.0',
        stats: ['YOUTUBE', 'SPOTIFY', 'INSTAGRAM', 'TIKTOK']
    },
    {
        id: '2',
        title: 'MECHANICAL PRECISION',
        subtitle: 'AUTOMATED DETECTION',
        description: 'Auto-detection algorithms handle complex URL parsing with instantaneous response times.',
        icon: <DownloadIcon size={48} color={Colors.primary} />,
        technical: 'PARSING LATENCY < 50MS',
        stats: ['AUTO-PASTE', 'LINK SCAN', 'MASS FETCH']
    },
    {
        id: '3',
        title: 'PREMIUM ARCHITECTURE',
        subtitle: 'INDUSTRIAL RELIABILITY',
        description: 'Open-source transparency meets industrial-grade file management and storage tracking.',
        icon: <CheckIcon size={48} color={Colors.primary} />,
        technical: 'ENCRYPTION ENABLED',
        stats: ['LOSSLESS', 'FLAC', '4K60FPS', 'RAW']
    }
];

interface OnboardingProps {
    onDone: () => void;
}

const OnboardingScreen: React.FC<OnboardingProps> = ({ onDone }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);
    const scanlineAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Scanline loop
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanlineAnim, {
                    toValue: 1,
                    duration: 4000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.timing(scanlineAnim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const goToNext = () => {
        Haptics.impact();
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            onDone();
        }
    };

    const handleSkip = () => {
        Haptics.selection();
        onDone();
    };

    const renderItem = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: 'clamp'
        });

        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.95, 1, 0.95],
            extrapolate: 'clamp'
        });

        return (
            <Animated.View style={[styles.slide, { opacity, transform: [{ scale }] }]}>
                {/* Module Container */}
                <View style={styles.moduleCard}>
                    <View style={styles.moduleHeader}>
                        <View style={styles.techBadge}>
                            <ShinyText
                                text={item.technical}
                                fontSize={10}
                                color={Colors.textMuted}
                                fontWeight="800"
                                letterSpacing={1}
                            />
                        </View>
                        <View style={styles.statusDot} />
                    </View>

                    <View style={styles.iconRing}>
                        <View style={styles.iconGlow} />
                        {item.icon}
                    </View>

                    <View style={styles.textContainer}>
                        <ShinyText
                            text={item.subtitle}
                            fontSize={12}
                            color={Colors.primary}
                            shineColor="#FFF"
                            fontWeight="800"
                            letterSpacing={2}
                        />
                        <Text style={styles.title}>{item.title}</Text>
                        <Text style={styles.description}>{item.description}</Text>
                    </View>

                    <View style={styles.statsGrid}>
                        {item.stats.map((stat, i) => (
                            <View key={i} style={styles.statChip}>
                                <Text style={styles.statText}>{stat}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </Animated.View>
        );
    };

    const scanlineTranslateY = scanlineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-height, height],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Atmospheric Layers */}
            <View style={styles.bgGlow} />
            <Animated.View
                style={[
                    styles.scanline,
                    { transform: [{ translateY: scanlineTranslateY }] }
                ]}
            />

            {/* Header Branding */}
            <View style={styles.header}>
                <View style={styles.brandRow}>
                    <Image
                        source={require('../../transparent_logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <View>
                        <Text style={styles.brandMain}>VIBE</Text>
                        <Text style={styles.brandSub}>DOWNLOADER</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                    <Text style={styles.skipText}>DEFER</Text>
                </TouchableOpacity>
            </View>

            {/* Slide Component */}
            <Animated.FlatList
                ref={flatListRef}
                data={SLIDES}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true }
                )}
                onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                    if (index !== currentIndex) {
                        setCurrentIndex(index);
                        Haptics.selection();
                    }
                }}
                renderItem={renderItem}
                keyExtractor={item => item.id}
            />

            {/* Footer Control */}
            <View style={styles.footer}>
                <View style={styles.pagination}>
                    {SLIDES.map((_, index) => {
                        const dotWidth = scrollX.interpolate({
                            inputRange: [(index - 1) * width, index * width, (index + 1) * width],
                            outputRange: [6, 20, 6],
                            extrapolate: 'clamp'
                        });
                        return (
                            <Animated.View
                                key={index}
                                style={[
                                    styles.dot,
                                    { width: dotWidth },
                                    currentIndex === index && { backgroundColor: Colors.primary }
                                ]}
                            />
                        );
                    })}
                </View>

                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={goToNext}
                    activeOpacity={0.85}
                >
                    <Text style={styles.primaryBtnText}>
                        {currentIndex === SLIDES.length - 1 ? 'AUTHORIZE SYSTEM' : 'NEXT SEQUENCE'}
                    </Text>
                    <View style={styles.btnGlow} />
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
    bgGlow: {
        position: 'absolute',
        width: width * 1.2,
        height: width * 1.2,
        borderRadius: width,
        backgroundColor: Colors.primary,
        opacity: 0.04,
        top: height * 0.2,
        left: -width * 0.1,
    },
    scanline: {
        position: 'absolute',
        width: '100%',
        height: 150,
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.02)',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    logo: {
        width: 44,
        height: 44,
    },
    brandMain: {
        fontSize: 18,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    brandSub: {
        fontSize: 10,
        fontWeight: Typography.weights.medium,
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    skipBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    skipText: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
    },
    slide: {
        width,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    moduleCard: {
        width: '100%',
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        padding: 24,
        elevation: 10,
    },
    moduleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    techBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
    },
    techBadgeText: {
        fontSize: 9,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
        shadowColor: Colors.primary,
        shadowRadius: 6,
        shadowOpacity: 0.5,
    },
    iconRing: {
        width: 100,
        height: 100,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
    },
    iconGlow: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.primary,
        opacity: 0.1,
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    subtitle: {
        fontSize: 10,
        fontWeight: Typography.weights.black,
        color: Colors.primary,
        letterSpacing: 2.5,
        marginBottom: 8,
        textAlign: 'center',
    },
    title: {
        fontSize: 26,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        fontWeight: Typography.weights.medium,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    statChip: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
    },
    statText: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 60,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 32,
    },
    dot: {
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    primaryBtn: {
        width: '100%',
        height: 60,
        borderRadius: 16,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    primaryBtnText: {
        fontSize: 14,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: 1,
        zIndex: 2,
    },
    btnGlow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        zIndex: 1,
    }
});

export default OnboardingScreen;
