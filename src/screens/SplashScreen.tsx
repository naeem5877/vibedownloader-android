import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, Easing, StatusBar } from 'react-native';
import { Colors } from '../theme';

interface SplashScreenProps {
    onFinish: () => void;
}

// Total on-screen time is roughly HOLD_MS + EXIT_MS.
const HOLD_MS = 1500;
const EXIT_MS = 260;
const LOGO_SIZE = 96;

/** A thin ring that expands from the logo and fades out. */
const Ripple: React.FC<{ delay: number }> = ({ delay }) => {
    const t = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(t, {
                    toValue: 1,
                    duration: 2200,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.ripple,
                {
                    opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] }),
                    transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 2.6] }) }],
                },
            ]}
        />
    );
};

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const onFinishRef = useRef(onFinish);
    onFinishRef.current = onFinish;

    const logoOpacity = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0.88)).current;
    const wordOpacity = useRef(new Animated.Value(0)).current;
    const wordLift = useRef(new Animated.Value(10)).current;
    const tagOpacity = useRef(new Animated.Value(0)).current;
    const screenOpacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const ease = Easing.out(Easing.cubic);

        Animated.parallel([
            Animated.timing(logoOpacity, { toValue: 1, duration: 500, easing: ease, useNativeDriver: true }),
            Animated.timing(logoScale, { toValue: 1, duration: 600, easing: ease, useNativeDriver: true }),
            Animated.sequence([
                Animated.delay(200),
                Animated.parallel([
                    Animated.timing(wordOpacity, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
                    Animated.timing(wordLift, { toValue: 0, duration: 450, easing: ease, useNativeDriver: true }),
                ]),
            ]),
            Animated.sequence([
                Animated.delay(420),
                Animated.timing(tagOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
            ]),
        ]).start();

        const timer = setTimeout(() => {
            Animated.timing(screenOpacity, {
                toValue: 0,
                duration: EXIT_MS,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) onFinishRef.current();
            });
        }, HOLD_MS);

        return () => clearTimeout(timer);
    }, []);

    return (
        <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
            <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

            <View style={styles.center}>
                {/* Logo with soft ripples behind it */}
                <View style={styles.logoSlot}>
                    <Ripple delay={0} />
                    <Ripple delay={1100} />
                    <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
                        <Image
                            source={require('../../transparent_logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </Animated.View>
                </View>

                <Animated.View style={[styles.wordRow, { opacity: wordOpacity, transform: [{ translateY: wordLift }] }]}>
                    <Text style={styles.wordMain} allowFontScaling={false}>Vibe</Text>
                    <Text style={styles.wordAccent} allowFontScaling={false}>Downloader</Text>
                </Animated.View>

                <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]} allowFontScaling={false}>
                    DOWNLOAD FROM ANY PLATFORM
                </Animated.Text>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0C',
        justifyContent: 'center',
        alignItems: 'center',
    },
    center: {
        alignItems: 'center',
        // sit slightly above true centre, which looks optically centred
        marginTop: -40,
    },
    logoSlot: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 36,
    },
    logo: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
    },
    ripple: {
        position: 'absolute',
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        borderRadius: LOGO_SIZE / 2,
        borderWidth: 1,
        borderColor: Colors.primaryLight,
    },
    wordRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    // Same two-tone wordmark as the Home header.
    wordMain: {
        fontSize: 34,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -1.2,
        includeFontPadding: false,
    },
    wordAccent: {
        fontSize: 34,
        fontWeight: '300',
        color: Colors.primaryLight,
        letterSpacing: -1,
        includeFontPadding: false,
    },
    tagline: {
        marginTop: 14,
        fontSize: 11,
        fontWeight: '600',
        color: '#6B6B78',
        letterSpacing: 3,
        includeFontPadding: false,
    },
});

export default SplashScreen;
