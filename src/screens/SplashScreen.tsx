import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
    onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useksNativeDriver: true,
                useNativeDriver: true
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 6,
                tension: 40,
                useNativeDriver: true
            })
        ]).start();

        // Glow Loop
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: true
                }),
                Animated.timing(glowAnim, {
                    toValue: 0,
                    duration: 1500,
                    useNativeDriver: true
                })
            ])
        ).start();

        // Exit
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1.2,
                    duration: 500,
                    useNativeDriver: true
                })
            ]).start(() => onFinish());
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.content,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }]
                    }
                ]}
            >
                {/* Glow Effect */}
                <Animated.View style={[styles.glow, { opacity: glowAnim }]} />

                <Text style={styles.logo}>VibeDownloader</Text>
                <Text style={styles.tagline}>Universal Media Downloader</Text>

                <View style={styles.loaderContainer}>
                    <Animated.View style={[styles.loaderDot, { opacity: glowAnim }]} />
                </View>
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
    content: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        fontSize: 42,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 1,
        marginBottom: Spacing.sm,
    },
    glow: {
        position: 'absolute',
        width: 300,
        height: 300,
        backgroundColor: Colors.primary,
        borderRadius: 150,
        opacity: 0.2,
        transform: [{ scale: 1.5 }],
        zIndex: -1,
    },
    tagline: {
        fontSize: Typography.sizes.md,
        color: Colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    loaderContainer: {
        marginTop: Spacing.xl,
        height: 4,
        width: 100,
        backgroundColor: Colors.surface,
        borderRadius: 2,
        overflow: 'hidden',
    },
    loaderDot: {
        height: '100%',
        width: '100%',
        backgroundColor: Colors.primary,
    }
});

export default SplashScreen;
