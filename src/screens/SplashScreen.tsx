import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
    onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.6)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const textFadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Logo entrance with spring
        Animated.sequence([
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 50,
                    useNativeDriver: true
                })
            ]),
            // Text fade in after logo
            Animated.timing(textFadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            })
        ]).start();

        // Glow pulse loop
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 1200,
                    useNativeDriver: true
                }),
                Animated.timing(glowAnim, {
                    toValue: 0.3,
                    duration: 1200,
                    useNativeDriver: true
                })
            ])
        ).start();

        // Logo subtle pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 1500,
                    useNativeDriver: true
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: true
                })
            ])
        ).start();

        // Exit animation
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1.3,
                    duration: 400,
                    useNativeDriver: true
                })
            ]).start(() => onFinish());
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            {/* Background glow effects */}
            <Animated.View
                style={[
                    styles.glowCircle,
                    styles.glowCircle1,
                    { opacity: glowAnim }
                ]}
            />
            <Animated.View
                style={[
                    styles.glowCircle,
                    styles.glowCircle2,
                    { opacity: Animated.multiply(glowAnim, 0.7) }
                ]}
            />

            <Animated.View
                style={[
                    styles.content,
                    {
                        opacity: fadeAnim,
                        transform: [
                            { scale: Animated.multiply(scaleAnim, pulseAnim) }
                        ]
                    }
                ]}
            >
                {/* Logo Image */}
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../transparent_logo.png')}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>
            </Animated.View>

            {/* App Name and Tagline */}
            <Animated.View
                style={[
                    styles.textContainer,
                    { opacity: textFadeAnim }
                ]}
            >
                <Text style={styles.appName}>VibeDownloader</Text>
                <Text style={styles.tagline}>Universal Media Downloader</Text>
            </Animated.View>

            {/* Loading indicator */}
            <Animated.View
                style={[
                    styles.loaderContainer,
                    { opacity: textFadeAnim }
                ]}
            >
                <Animated.View
                    style={[
                        styles.loaderBar,
                        {
                            opacity: glowAnim,
                            transform: [{ scaleX: glowAnim }]
                        }
                    ]}
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    glowCircle: {
        position: 'absolute',
        borderRadius: 9999,
    },
    glowCircle1: {
        width: 350,
        height: 350,
        backgroundColor: Colors.primary,
        opacity: 0.15,
    },
    glowCircle2: {
        width: 450,
        height: 450,
        backgroundColor: Colors.secondary,
        opacity: 0.08,
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        width: 180,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoImage: {
        width: 180,
        height: 180,
    },
    textContainer: {
        alignItems: 'center',
        marginTop: Spacing.xl,
    },
    appName: {
        fontSize: 36,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: 1,
        marginBottom: Spacing.xs,
    },
    tagline: {
        fontSize: Typography.sizes.sm,
        color: Colors.textMuted,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    loaderContainer: {
        position: 'absolute',
        bottom: 100,
        width: 120,
        height: 3,
        backgroundColor: Colors.surface,
        borderRadius: 2,
        overflow: 'hidden',
    },
    loaderBar: {
        height: '100%',
        width: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 2,
    }
});

export default SplashScreen;
