import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image, Easing, StatusBar } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';
import Svg, { Circle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
    onFinish: () => void;
}

const CircularLoader = () => {
    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 1500,
                easing: Easing.bezier(0.4, 0.0, 0.2, 1),
                useNativeDriver: true
            })
        ).start();
    }, []);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Svg width={48} height={48} viewBox="0 0 48 48">
                <Circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke={`${Colors.primary}30`} // 30% opacity
                    strokeWidth="4"
                    fill="none"
                />
                <Circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke={Colors.primary}
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray="30 100"
                    strokeLinecap="round"
                />
            </Svg>
        </Animated.View>
    );
};

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0.85)).current;
    const logoTranslateY = useRef(new Animated.Value(30)).current;
    const bgOpacity = useRef(new Animated.Value(0)).current;
    const scanlineAnim = useRef(new Animated.Value(0)).current;
    const textFade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance sequence
        Animated.stagger(200, [
            // Stage 1: Ambient Background
            Animated.timing(bgOpacity, {
                toValue: 0.15,
                duration: 1200,
                useNativeDriver: true,
            }),
            // Stage 2: Logo Entrance
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(logoScale, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(logoTranslateY, {
                    toValue: 0,
                    duration: 1000,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
            ]),
            // Stage 3: Text Fade
            Animated.timing(textFade, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
        ]).start();

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

        // Exit sequence
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(logoScale, {
                    toValue: 1.1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start(() => onFinish());
        }, 3200);

        return () => clearTimeout(timer);
    }, []);

    const scanlineTranslateY = scanlineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-height, height],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Atmospheric Background Layers */}
            <Animated.View style={[styles.bgPulse, { opacity: bgOpacity }]} />
            <View style={styles.vignette} />

            {/* Industrial Scanline Effect */}
            <Animated.View
                style={[
                    styles.scanline,
                    { transform: [{ translateY: scanlineTranslateY }] }
                ]}
            />

            <View style={styles.contentContainer}>
                {/* Logo with Glow */}
                <Animated.View
                    style={[
                        styles.logoContainer,
                        {
                            opacity: fadeAnim,
                            transform: [
                                { scale: logoScale },
                                { translateY: logoTranslateY }
                            ]
                        }
                    ]}
                >
                    <View style={styles.logoShield}>
                        <Image
                            source={require('../../transparent_logo.png')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                    </View>
                    <View style={styles.logoGlowRing} />
                </Animated.View>

                {/* Branding Text */}
                <Animated.View style={[styles.textContainer, { opacity: textFade }]}>
                    <View style={styles.brandRow}>
                        <Text style={styles.logoTextMain}>VIBE</Text>
                        <Text style={styles.logoTextAccent}>DOWNLOADER</Text>
                    </View>
                    <View style={styles.taglineWrapper}>
                        <View style={styles.taglineLine} />
                        <Text style={styles.taglineText}>PREMIUM ASSET CAPTURE</Text>
                        <View style={styles.taglineLine} />
                    </View>
                </Animated.View>

                {/* Technical Status Loader */}
                <Animated.View style={[styles.loaderWrapper, { opacity: textFade }]}>
                    <CircularLoader />
                    <Text style={styles.statusText}>INITIALIZING SYSTEM...</Text>
                </Animated.View>
            </View>

            {/* Bottom Version Indicator */}
            <View style={styles.footer}>
                <Text style={styles.versionLabel}>BUILD v1.1.0 • ARM64</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0C', // Deeper than standard background for splash
        justifyContent: 'center',
        alignItems: 'center',
    },
    bgPulse: {
        position: 'absolute',
        width: width * 1.5,
        height: width * 1.5,
        borderRadius: width,
        backgroundColor: Colors.primary,
    },
    vignette: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
        borderWidth: 100,
        borderColor: 'rgba(0,0,0,0.4)',
        borderRadius: 1,
    },
    scanline: {
        position: 'absolute',
        width: '100%',
        height: 200,
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.02)',
    },
    contentContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        width: 150,
        height: 150,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    logoShield: {
        width: 120,
        height: 120,
        zIndex: 2,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    logoGlowRing: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: Colors.primary,
        opacity: 0.08,
        zIndex: 1,
    },
    textContainer: {
        alignItems: 'center',
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    logoTextMain: {
        fontSize: 34,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    logoTextAccent: {
        fontSize: 34,
        fontWeight: Typography.weights.light,
        color: Colors.textSecondary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    taglineWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 12,
    },
    taglineLine: {
        width: 20,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    taglineText: {
        fontSize: 10,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 2,
    },
    loaderWrapper: {
        marginTop: 60,
        alignItems: 'center',
        gap: 16,
    },
    statusText: {
        fontSize: 9,
        fontWeight: Typography.weights.semibold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
    },
    footer: {
        position: 'absolute',
        bottom: 50,
    },
    versionLabel: {
        fontSize: 10,
        fontWeight: Typography.weights.medium,
        color: 'rgba(255, 255, 255, 0.2)',
        letterSpacing: 1.5,
    },
});

export default SplashScreen;
