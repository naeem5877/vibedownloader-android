import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Image } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon, CheckIcon } from '../components/Icons';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Universal Media Downloader',
        subtitle: 'VibeDownloader',
        description: 'Download videos, music, and photos from YouTube, Spotify, TikTok, Instagram, and more with one tap.',
        icon: <SparkleIcon size={70} color="#FFF" />,
        gradient: ['#6366F1', '#3B82F6'],
        themeColor: '#6366F1',
        emoji: '🚀'
    },
    {
        id: '2',
        title: 'Simple & Lightning Fast',
        subtitle: 'PASTE & GO',
        description: 'Auto-detection handles everything. Copy any link, paste, and let Vibe handle the heavy lifting.',
        icon: <DownloadIcon size={70} color="#FFF" />,
        gradient: ['#F97316', '#FB923C'],
        themeColor: '#F97316',
        emoji: '⚡'
    },
    {
        id: '3',
        title: 'Premium Engineering',
        subtitle: 'OPEN SOURCE & TRANSPARENT',
        description: 'Save content directly to your gallery. Always stay updated with the latest fixes from GitHub.',
        icon: <CheckIcon size={70} color="#FFF" />,
        gradient: ['#10B981', '#34D399'],
        themeColor: '#10B981',
        emoji: '✨'
    }
];

interface OnboardingProps {
    onDone: () => void;
}

const OnboardingScreen: React.FC<OnboardingProps> = ({ onDone }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);

    // Floating animation for icons
    const floatAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        // Float animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -12, duration: 1800, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 1800, useNativeDriver: true })
            ])
        ).start();

        // Subtle scale pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const goToNext = () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        } else {
            onDone();
        }
    };

    const renderItem = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1, 0.8],
            extrapolate: 'clamp'
        });

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: 'clamp'
        });

        const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [100, 0, 100],
            extrapolate: 'clamp'
        });

        return (
            <Animated.View style={[styles.slide, { opacity, transform: [{ scale }, { translateY }] }]}>
                {/* Visual Accent */}
                <View style={[styles.visualAccent, { backgroundColor: item.themeColor }]} />

                {/* Icon Container with glow */}
                <Animated.View
                    style={[
                        styles.iconContainer,
                        {
                            backgroundColor: item.gradient[0],
                            transform: [
                                { translateY: floatAnim },
                                { scale: scaleAnim }
                            ]
                        }
                    ]}
                >
                    <View style={[styles.iconGlow, { backgroundColor: item.gradient[0] }]} />
                    {item.icon}
                </Animated.View>

                {/* Text Content */}
                <View style={styles.textContainer}>
                    <Text style={[styles.subtitle, { color: item.themeColor }]}>{item.subtitle}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>
                </View>

                {/* Platform Grid on first slide */}
                {index === 0 && (
                    <View style={styles.platformGrid}>
                        <View style={styles.tag}><Text style={styles.tagText}>YouTube</Text></View>
                        <View style={styles.tag}><Text style={styles.tagText}>Spotify</Text></View>
                        <View style={styles.tag}><Text style={styles.tagText}>TikTok</Text></View>
                        <View style={styles.tag}><Text style={styles.tagText}>Insta</Text></View>
                        <View style={styles.tag}><Text style={styles.tagText}>FB</Text></View>
                        <View style={styles.tag}><Text style={styles.tagText}>+ 10 More</Text></View>
                    </View>
                )}
            </Animated.View>
        );
    };

    const isLastSlide = currentIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>
            {/* Logo in top center */}
            <View style={styles.headerBranding}>
                <Image
                    source={require('../../transparent_logo.png')}
                    style={styles.onboardingLogo}
                    resizeMode="contain"
                />
                <Text style={styles.brandName}>VibeDownloader</Text>
            </View>

            {/* Background decorations */}
            <View style={[styles.bgDecorCircle, { top: -100, right: -50, backgroundColor: Colors.primary }]} />
            <View style={[styles.bgDecorCircle, { bottom: 100, left: -100, backgroundColor: Colors.accent }]} />

            {/* Content */}
            <View style={styles.flatListContainer}>
                <Animated.FlatList
                    ref={flatListRef}
                    data={SLIDES}
                    renderItem={renderItem}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: true }
                    )}
                    onMomentumScrollEnd={(e) => {
                        const index = Math.round(e.nativeEvent.contentOffset.x / width);
                        setCurrentIndex(index);
                    }}
                    getItemLayout={(_, index) => ({
                        length: width,
                        offset: width * index,
                        index,
                    })}
                    onScrollToIndexFailed={(info) => {
                        flatListRef.current?.scrollToOffset({
                            offset: info.averageItemLength * info.index,
                            animated: true,
                        });
                    }}
                    keyExtractor={item => item.id}
                />
            </View>

            {/* Skip button - moved here to ensure it's on top of the list */}
            {!isLastSlide && (
                <TouchableOpacity style={[styles.skipButton, { zIndex: 30 }]} onPress={onDone}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
            )}

            {/* Pagination */}
            <View style={styles.pagination}>
                {SLIDES.map((item, index) => {
                    const dotWidth = scrollX.interpolate({
                        inputRange: [(index - 1) * width, index * width, (index + 1) * width],
                        outputRange: [8, 32, 8],
                        extrapolate: 'clamp'
                    });
                    const dotOpacity = scrollX.interpolate({
                        inputRange: [(index - 1) * width, index * width, (index + 1) * width],
                        outputRange: [0.3, 1, 0.3],
                        extrapolate: 'clamp'
                    });
                    return (
                        <Animated.View
                            key={index}
                            style={[
                                styles.dot,
                                {
                                    width: dotWidth,
                                    opacity: dotOpacity,
                                    backgroundColor: item.themeColor
                                }
                            ]}
                        />
                    );
                })}
            </View>

            {/* Action Button */}
            <View style={[styles.footer, { zIndex: 20 }]}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        isLastSlide && styles.buttonGetStarted
                    ]}
                    onPress={goToNext}
                    activeOpacity={0.8}
                >
                    <Text style={styles.buttonText}>
                        {isLastSlide ? "Get Started 🎉" : "Next"}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    headerBranding: {
        position: 'absolute',
        top: 60,
        alignItems: 'center',
        width: '100%',
        zIndex: 10,
    },
    onboardingLogo: {
        width: 100,
        height: 100,
        marginBottom: Spacing.xs,
    },
    brandName: {
        fontSize: 28,
        fontWeight: '900',
        color: Colors.textPrimary,
        letterSpacing: 2,
    },
    bgDecorCircle: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        opacity: 0.04,
    },
    skipButton: {
        position: 'absolute',
        top: 65,
        right: 24,
        zIndex: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    skipText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
    },
    flatListContainer: {
        flex: 1,
        marginTop: 60,
    },
    slide: {
        width,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    visualAccent: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        opacity: 0.05,
        filter: 'blur(50px)',
    },
    iconContainer: {
        width: 160,
        height: 160,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xxl,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        ...Shadows.xl,
    },
    iconGlow: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        opacity: 0.15,
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 3,
        textTransform: 'uppercase',
        marginBottom: Spacing.sm,
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
        textAlign: 'center',
        lineHeight: 44,
    },
    description: {
        fontSize: 17,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 28,
        paddingHorizontal: Spacing.md,
    },
    platformGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        marginTop: Spacing.xl,
        maxWidth: 320,
    },
    tag: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    tagText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 60,
    },
    dot: {
        height: 10,
        borderRadius: 5,
        marginHorizontal: 6,
    },
    footer: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: 60,
    },
    button: {
        backgroundColor: Colors.surface,
        paddingVertical: 22,
        borderRadius: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.md,
    },
    buttonGetStarted: {
        backgroundColor: '#6366F1',
        borderColor: '#818CF8',
        ...Shadows.glow('#6366F1'),
    },
    buttonText: {
        color: Colors.textPrimary,
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 0.5,
    }
});

export default OnboardingScreen;
