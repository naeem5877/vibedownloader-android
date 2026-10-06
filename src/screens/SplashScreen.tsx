import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Image,
    Easing,
    StatusBar,
    NativeModules,
} from 'react-native';
import { Colors } from '../theme';

interface SplashScreenProps {
    /**
     * True once the app underneath has mounted. The splash is an overlay: the
     * real UI mounts behind it while it plays, and it only leaves when that
     * work is finished, so there is never an empty frame between the two.
     */
    ready: boolean;
    onFinish: () => void;
}

// The splash stays at least this long (long enough for the wordmark to play)...
const MIN_HOLD_MS = 1100;
// ...and never longer than this, even if the app underneath is slow.
const MAX_WAIT_MS = 4000;
const EXIT_MS = 260;
// Must match the native launch splash (res/drawable-*/splash_logo.png is drawn
// at this size) so the hand-off from native to JS is invisible.
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
                    // Ambient loop: must not hold an interaction handle open
                    isInteraction: false,
                    useNativeDriver: true,
                }),
                Animated.timing(t, {
                    toValue: 0,
                    duration: 0,
                    isInteraction: false,
                    useNativeDriver: true,
                }),
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

const SplashScreen: React.FC<SplashScreenProps> = ({ ready, onFinish }) => {
    const onFinishRef = useRef(onFinish);
    onFinishRef.current = onFinish;

    const wordOpacity = useRef(new Animated.Value(0)).current;
    const wordLift = useRef(new Animated.Value(10)).current;
    const tagOpacity = useRef(new Animated.Value(0)).current;
    const screenOpacity = useRef(new Animated.Value(1)).current;

    const [minElapsed, setMinElapsed] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);
    const exiting = useRef(false);
    const handedOver = useRef(false);

    // The logo is deliberately static (full opacity, full size, dead centre):
    // that is exactly what the native splash is showing, so when native lets
    // go there is nothing to see change. Only the wordmark animates in.
    useEffect(() => {
        const ease = Easing.out(Easing.cubic);

        Animated.parallel([
            Animated.sequence([
                Animated.delay(150),
                Animated.parallel([
                    Animated.timing(wordOpacity, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
                    Animated.timing(wordLift, { toValue: 0, duration: 450, easing: ease, useNativeDriver: true }),
                ]),
            ]),
            Animated.sequence([
                Animated.delay(380),
                Animated.timing(tagOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
            ]),
        ]).start();

        const minTimer = setTimeout(() => setMinElapsed(true), MIN_HOLD_MS);
        const maxTimer = setTimeout(() => setGaveUp(true), MAX_WAIT_MS);
        return () => {
            clearTimeout(minTimer);
            clearTimeout(maxTimer);
        };
    }, []);

    // Leave only when the minimum time has passed AND the app is ready (or we
    // have waited as long as we are willing to).
    useEffect(() => {
        if (exiting.current) return;
        if (!((minElapsed && ready) || gaveUp)) return;
        exiting.current = true;

        Animated.timing(screenOpacity, {
            toValue: 0,
            duration: EXIT_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
        }).start(() => onFinishRef.current());
    }, [minElapsed, ready, gaveUp]);

    // First laid-out frame: tell the native splash it can hand over to us.
    const handleLayout = useCallback(() => {
        if (handedOver.current) return;
        handedOver.current = true;
        requestAnimationFrame(() => {
            try {
                NativeModules.SplashModule?.hide?.();
            } catch {
                // Native splash has its own timeout, so this is only a nicety.
            }
        });
    }, []);

    return (
        <Animated.View style={[styles.container, { opacity: screenOpacity }]} onLayout={handleLayout}>
            <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

            {/* Logo with soft ripples behind it, centred on the screen */}
            <View style={styles.logoSlot}>
                <Ripple delay={0} />
                <Ripple delay={1100} />
                <Image
                    source={require('../../transparent_logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            {/* Pinned below the logo so the logo itself never moves */}
            <View style={styles.textBlock} pointerEvents="none">
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
    logoSlot: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
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
    textBlock: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        marginTop: LOGO_SIZE / 2 + 32,
        alignItems: 'center',
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
