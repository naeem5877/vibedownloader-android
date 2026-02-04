import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image, Easing } from 'react-native';
import { Colors, Typography, Spacing, Shadows } from '../theme';
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
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const translateYAnim = useRef(new Animated.Value(20)).current;
    const bgScaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Background breathing effect
        Animated.loop(
            Animated.sequence([
                Animated.timing(bgScaleAnim, {
                    toValue: 1.1,
                    duration: 4000,
                    useNativeDriver: true,
                }),
                Animated.timing(bgScaleAnim, {
                    toValue: 1,
                    duration: 4000,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        // Entrance Sequence
        Animated.sequence([
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 7,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: 0,
                    duration: 800,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]),
        ]).start();

        // Exit Sequence
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1.2,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]).start(() => onFinish());
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            {/* Ambient Background Glow */}
            <Animated.View
                style={[
                    styles.bgGlow,
                    {
                        transform: [{ scale: bgScaleAnim }],
                    },
                ]}
            />

            <View style={styles.contentContainer}>
                {/* Logo & Branding */}
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [
                            { scale: scaleAnim },
                            { translateY: translateYAnim }
                        ],
                        alignItems: 'center',
                    }}
                >
                    <View style={styles.logoWrapper}>
                        <Image
                            source={require('../../transparent_logo.png')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                    </View>

                    <Text style={styles.appName}>VibeDownloader</Text>
                    <Text style={styles.tagline}>Premium Media Downloader</Text>
                </Animated.View>

                {/* Animated Loader */}
                <Animated.View
                    style={[
                        styles.loaderContainer,
                        { opacity: fadeAnim }
                    ]}
                >
                    <CircularLoader />
                </Animated.View>
            </View>

            {/* Version or Footer */}
            <View style={styles.footer}>
                <Text style={styles.versionText}>v{require('../../package.json').version}</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    bgGlow: {
        position: 'absolute',
        width: width * 1.5,
        height: width * 1.5,
        borderRadius: width,
        backgroundColor: Colors.primary,
        opacity: 0.05,
        top: -width * 0.5,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    logoWrapper: {
        width: 140, // Slightly improved sizing
        height: 140,
        marginBottom: Spacing.xl,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3, // Added glow shadow to logo
        shadowRadius: 20,
        elevation: 10,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    appName: {
        fontSize: 32,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: 0.5,
        marginBottom: Spacing.xs,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    tagline: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        letterSpacing: 2,
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    loaderContainer: {
        marginTop: Spacing.xxxl,
        alignItems: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: Spacing.xl,
        opacity: 0.5,
    },
    versionText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xs,
        letterSpacing: 1,
    }
});

export default SplashScreen;
