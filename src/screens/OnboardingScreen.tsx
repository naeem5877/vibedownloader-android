import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Image } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon, CheckIcon } from '../components/Icons';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Welcome to Vibe',
        subtitle: 'Universal Media Downloader',
        description: 'Download videos, music, and photos from YouTube, Spotify, TikTok, Instagram, and many more platforms.',
        icon: <SparkleIcon size={60} color="#FFF" />,
        gradient: [Colors.primary, Colors.secondary],
        emoji: '🚀'
    },
    {
        id: '2',
        title: 'Simple & Fast',
        subtitle: 'Just Paste & Download',
        description: 'Copy any link from your favorite apps and paste it here. We handle everything else automatically.',
        icon: <DownloadIcon size={60} color="#FFF" />,
        gradient: [Colors.secondary, Colors.accent],
        emoji: '⚡'
    },
    {
        id: '3',
        title: 'Stay Updated',
        subtitle: 'Auto-Updates from GitHub',
        description: 'Get the latest features automatically. Your downloads are saved to your gallery for easy access.',
        icon: <CheckIcon size={60} color="#FFF" />,
        gradient: [Colors.success, '#00B894'],
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

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp'
        });

        const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [50, 0, 50],
            extrapolate: 'clamp'
        });

        return (
            <Animated.View style={[styles.slide, { opacity, transform: [{ translateY }] }]}>
                {/* Emoji Badge */}
                <Text style={styles.emojiBadge}>{item.emoji}</Text>

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
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>
                </View>

                {/* Feature Tags */}
                {index === 0 && (
                    <View style={styles.featureTags}>
                        <View style={styles.tag}>
                            <Text style={styles.tagText}>YouTube</Text>
                        </View>
                        <View style={styles.tag}>
                            <Text style={styles.tagText}>Spotify</Text>
                        </View>
                        <View style={styles.tag}>
                            <Text style={styles.tagText}>TikTok</Text>
                        </View>
                        <View style={styles.tag}>
                            <Text style={styles.tagText}>+ More</Text>
                        </View>
                    </View>
                )}
            </Animated.View>
        );
    };

    const isLastSlide = currentIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>
            {/* Background decorations */}
            <View style={styles.bgDecor1} />
            <View style={styles.bgDecor2} />

            {/* Skip button */}
            {!isLastSlide && (
                <TouchableOpacity style={styles.skipButton} onPress={onDone}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
            )}

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
                    keyExtractor={item => item.id}
                />
            </View>

            {/* Pagination */}
            <View style={styles.pagination}>
                {SLIDES.map((_, index) => {
                    const dotWidth = scrollX.interpolate({
                        inputRange: [(index - 1) * width, index * width, (index + 1) * width],
                        outputRange: [8, 28, 8],
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
                                    backgroundColor: Colors.primary
                                }
                            ]}
                        />
                    );
                })}
            </View>

            {/* Action Button */}
            <View style={styles.footer}>
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
    bgDecor1: {
        position: 'absolute',
        top: -100,
        right: -100,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: Colors.primary,
        opacity: 0.05,
    },
    bgDecor2: {
        position: 'absolute',
        bottom: -50,
        left: -80,
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: Colors.secondary,
        opacity: 0.05,
    },
    skipButton: {
        position: 'absolute',
        top: 50,
        right: 24,
        zIndex: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    skipText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.base,
        fontWeight: '500',
    },
    flatListContainer: {
        flex: 1,
        marginTop: 80,
    },
    slide: {
        width,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    emojiBadge: {
        fontSize: 40,
        marginBottom: Spacing.lg,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xl,
        ...Shadows.lg,
    },
    iconGlow: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        opacity: 0.2,
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    subtitle: {
        fontSize: Typography.sizes.xs,
        color: Colors.primary,
        fontWeight: '600',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: Spacing.xs,
    },
    title: {
        fontSize: 34,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    description: {
        fontSize: Typography.sizes.base,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 26,
        paddingHorizontal: Spacing.md,
    },
    featureTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginTop: Spacing.md,
    },
    tag: {
        backgroundColor: Colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: BorderRadius.round,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    tagText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: '500',
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        marginHorizontal: 4,
    },
    footer: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: 50,
    },
    button: {
        backgroundColor: Colors.surface,
        paddingVertical: 18,
        borderRadius: BorderRadius.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    buttonGetStarted: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
        ...Shadows.glow(Colors.primary),
    },
    buttonText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
    }
});

export default OnboardingScreen;
