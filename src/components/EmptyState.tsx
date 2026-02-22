import React, { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated, Easing, Text, Dimensions, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography, PlatformThemes, Shadows, BorderRadius } from '../theme';
import {
    SparkleIcon,
    VideoIcon,
    MusicIcon,
    WaveformIcon,
    StarIcon,
    DownloadIcon,
    FacebookIcon,
    XIcon,
    FolderIcon,
    LinkIcon,
    ClipboardIcon,
    CheckIcon,
    YouTubeIcon,
    InstagramIcon,
    TikTokIcon,
    SpotifyIcon,
    PinterestIcon,
    SoundCloudIcon
} from './Icons';
import { ShinyText } from './ShinyText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface EmptyStateProps {
    platform?: string | null;
    isOffline?: boolean;
    title?: string;
    subtitle?: string;
    support?: string;
    features?: string[];
    icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    platform,
    isOffline = false,
    title,
    subtitle,
    support,
    features,
    icon
}) => {
    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const stepsAnim = useRef(new Animated.Value(0)).current;
    const orbAnim1 = useRef(new Animated.Value(0)).current;
    const orbAnim2 = useRef(new Animated.Value(0)).current;

    const currentPlatform = platform || 'Universal';

    useEffect(() => {
        // Reset and trigger entry
        fadeAnim.setValue(0);
        slideAnim.setValue(20);
        stepsAnim.setValue(0);

        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic)
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true
            }),
            Animated.timing(stepsAnim, {
                toValue: 1,
                duration: 1000,
                delay: 300,
                useNativeDriver: true,
                easing: Easing.out(Easing.back(1.2))
            })
        ]).start();

        // Continuous Loop Animations
        const startLoops = () => {
            // Pulse
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 3000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 3000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Rotation for hero rings
            Animated.loop(
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 20000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();

            // Orb Float
            const createFloat = (val: Animated.Value, duration: number, distance: number) => {
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(val, {
                            toValue: distance,
                            duration,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(val, {
                            toValue: 0,
                            duration,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ).start();
            };
            createFloat(orbAnim1, 5000, 15);
            createFloat(orbAnim2, 7000, -20);
        };

        startLoops();
    }, [currentPlatform]);

    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const rotationRev = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '-360deg']
    });

    // Platform Data Configuration matching desktop
    const platformData = useMemo(() => ({
        YouTube: {
            title: 'YouTube Downloader',
            subtitle: 'Shorts, Long Videos & Playlists',
            support: 'Supported Content',
            features: ['🎬 Videos', '🎞️ Shorts', '📋 Playlists', '🎵 Music'],
            icon: <YouTubeIcon size={44} color={PlatformThemes.YouTube.primary} />,
            color: PlatformThemes.YouTube.primary
        },
        Spotify: {
            title: 'Spotify Downloader',
            subtitle: 'Music, Lossless & Hi-Res',
            support: 'Supported Content',
            features: ['🎵 Music', '🎬 Video', '🎧 Lossless', '💎 Hi-Res'],
            icon: <SpotifyIcon size={44} color={PlatformThemes.Spotify.primary} />,
            color: PlatformThemes.Spotify.primary
        },
        SoundCloud: {
            title: 'SoundCloud Downloader',
            subtitle: 'Tracks & Playlists',
            support: 'Supported Content',
            features: ['🎵 Tracks', '📋 Playlists', '🎧 HQ Stream', '🔥 Artists'],
            icon: <SoundCloudIcon size={44} color={PlatformThemes.SoundCloud.primary} />,
            color: PlatformThemes.SoundCloud.primary
        },
        Instagram: {
            title: 'Instagram Downloader',
            subtitle: 'Reels, Posts & Stories',
            support: 'Supported Content',
            features: ['🎬 Reels', '📷 Posts', '📖 Stories', '🖼️ Photos'],
            icon: <InstagramIcon size={44} color={PlatformThemes.Instagram.primary} />,
            color: PlatformThemes.Instagram.primary
        },
        TikTok: {
            title: 'TikTok Downloader',
            subtitle: 'Videos & Sounds',
            support: 'Supported Content',
            features: ['🎬 Videos', '🎵 Sounds', '🎥 No Mark', '🚀 Clean'],
            icon: <TikTokIcon size={44} color={PlatformThemes.TikTok.primary} />,
            color: PlatformThemes.TikTok.primary
        },
        Facebook: {
            title: 'Facebook Downloader',
            subtitle: 'Videos & Stories',
            support: 'Supported Content',
            features: ['📹 Reels', '📖 Stories', '🔒 Private', '⚡ HD'],
            icon: <FacebookIcon size={44} color={PlatformThemes.Facebook.primary} />,
            color: PlatformThemes.Facebook.primary
        },
        X: {
            title: 'X Downloader',
            subtitle: 'Videos & Photos',
            support: 'Supported Content',
            features: ['🎬 4K Video', '🖼️ HD Photos', '🏃 Fast Sync', '📂 GIFs'],
            icon: <XIcon size={44} color={PlatformThemes.X.primary} />,
            color: PlatformThemes.X.primary
        },
        Pinterest: {
            title: 'Pinterest Downloader',
            subtitle: 'Pins & Videos',
            support: 'Supported Content',
            features: ['📌 Pins', '🎬 Videos', '🖼️ HD', '🎨 Save'],
            icon: <PinterestIcon size={44} color={PlatformThemes.Pinterest.primary} />,
            color: PlatformThemes.Pinterest.primary
        }
    }), []);

    const data = useMemo(() => {
        // Find matching platform data case-insensitively
        const platformKey = Object.keys(platformData).find(
            key => key.toLowerCase() === currentPlatform.toLowerCase()
        );

        const baseData = (platformData as any)[platformKey || ''] || {
            title: 'Universal Downloader',
            subtitle: 'Multi-platform Media Extraction',
            support: 'Supported Content',
            features: ['🎬 Video', '🎵 Audio', '📸 Photos', '📂 Files'],
            icon: <SparkleIcon size={40} color={Colors.primary} />,
            color: Colors.primary,
            displayName: 'any platform'
        };

        return {
            title: title || baseData.title,
            subtitle: subtitle || baseData.subtitle,
            support: baseData.support,
            features: baseData.features,
            icon: icon || baseData.icon,
            color: baseData.color,
            displayName: baseData.displayName || (platformKey || currentPlatform)
        };
    }, [currentPlatform, platformData, title, subtitle, icon]);

    const renderStep = (index: number, icon: React.ReactNode, stepTitle: string, desc: string, iconBg: string, iconColor: string) => (
        <Animated.View
            style={[
                styles.stepCard,
                {
                    opacity: stepsAnim,
                    transform: [
                        { translateY: stepsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                        { scale: stepsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }
                    ]
                }
            ]}
        >
            <View style={[styles.stepIconContainer, { backgroundColor: `${iconColor}15` }]}>
                {icon}
            </View>
            <View style={styles.stepInfo}>
                <Text style={styles.stepTitle}>{stepTitle}</Text>
                <Text style={styles.stepDesc}>{desc}</Text>
            </View>
            <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>{index}</Text>
            </View>
        </Animated.View>
    );

    return (
        <Animated.View style={[
            styles.container,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
            {/* Background Orbs */}
            <Animated.View style={[styles.orb, styles.orbPrimary, { backgroundColor: data.color, transform: [{ translateY: orbAnim1 }] }]} />
            <Animated.View style={[styles.orb, styles.orbSecondary, { backgroundColor: data.color, transform: [{ translateY: orbAnim2 }] }]} />

            {/* Desktop-like Hero Section */}
            <View style={styles.heroSection}>
                <Animated.View
                    style={[
                        styles.heroPulse,
                        { backgroundColor: data.color, transform: [{ scale: pulseAnim }] }
                    ]}
                />
                <Animated.View style={[styles.outerRing, { borderColor: `${data.color}20`, transform: [{ rotate: rotation }] }]}>
                    <Animated.View style={[styles.innerRing, { borderColor: `${data.color}40`, backgroundColor: `${data.color}0A`, transform: [{ rotate: rotationRev }] }]}>
                        {data.icon}
                    </Animated.View>
                </Animated.View>
                <Text style={styles.title}>{data.title}</Text>
                <Text style={styles.subtitle}>{data.subtitle}</Text>
            </View>

            {/* How to Download Section */}
            <View style={styles.stepsSection}>
                <Text style={styles.sectionLabel}>HOW TO DOWNLOAD</Text>
                {renderStep(
                    1,
                    <LinkIcon size={20} color="#60A5FA" />,
                    'Copy the link',
                    `Copy the media URL from ${data.displayName}`,
                    '#3B82F6',
                    '#60A5FA'
                )}
                {renderStep(
                    2,
                    <ClipboardIcon size={20} color="#A78BFA" />,
                    'Paste it above',
                    'Use the Paste button or manual input',
                    '#8B5CF6',
                    '#A78BFA'
                )}
                {renderStep(
                    3,
                    <DownloadIcon size={20} color="#34D399" />,
                    'Choose & download',
                    'Select quality and start downloading',
                    '#10B981',
                    '#34D399'
                )}
            </View>

            {/* Supported Content Chips */}
            <View style={styles.supportedSection}>
                <View style={styles.supportedHeader}>
                    <SparkleIcon size={14} color="#FBBF24" />
                    <Text style={styles.sectionLabelCompact}>SUPPORTED CONTENT</Text>
                </View>
                <View style={styles.chipsContainer}>
                    {data.features.map((feature: string, i: number) => (
                        <View key={i} style={styles.chip}>
                            <Text style={styles.chipText}>{feature}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {isOffline && (
                <View style={styles.offlineLine}>
                    <Text style={styles.offlineText}>OFFLINE MODE ACTIVE</Text>
                </View>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 20,
    },
    orb: {
        position: 'absolute',
        borderRadius: 100,
        opacity: 0.05,
    },
    orbPrimary: {
        width: 200,
        height: 200,
        top: -40,
        left: -60,
    },
    orbSecondary: {
        width: 150,
        height: 150,
        bottom: 100,
        right: -40,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 35,
    },
    heroPulse: {
        position: 'absolute',
        width: 130,
        height: 130,
        borderRadius: 65,
        top: -5,
        opacity: 0.15,
    },
    outerRing: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 1,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    innerRing: {
        width: 90,
        height: 90,
        borderRadius: 45,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: -0.5,
        marginBottom: 6,
    },
    subtitle: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
    },
    stepsSection: {
        width: '100%',
        gap: 12,
        marginBottom: 30,
    },
    sectionLabel: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5,
        textAlign: 'center',
        marginBottom: 15,
        opacity: 0.6,
    },
    stepCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: `${Colors.surface}80`,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FFFFFF10',
        gap: 15,
    },
    stepIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepInfo: {
        flex: 1,
    },
    stepTitle: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    stepDesc: {
        color: Colors.textMuted,
        fontSize: 12,
        lineHeight: 16,
    },
    stepNumberBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#FFFFFF10',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumberText: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '900',
    },
    supportedSection: {
        width: '100%',
        backgroundColor: '#FFFFFF05',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FFFFFF08',
    },
    supportedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sectionLabelCompact: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
        opacity: 0.5,
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#FFFFFF10',
        borderRadius: 10,
    },
    chipText: {
        color: Colors.textSecondary,
        fontSize: 11,
        fontWeight: '600',
    },
    offlineLine: {
        marginTop: 30,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: `${Colors.error}10`,
        borderWidth: 1,
        borderColor: `${Colors.error}30`,
    },
    offlineText: {
        color: Colors.error,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    }
});
