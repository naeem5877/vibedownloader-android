/**
 * Premium PlatformSelector - Clean, modern horizontal selector with icon-only buttons
 */
import React, { useRef, useEffect } from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { Haptics } from '../utils/haptics';
import {
    YouTubeIcon,
    InstagramIcon,
    TikTokIcon,
    FacebookIcon,
    SpotifyIcon,
    XIcon,
    PinterestIcon,
    SoundCloudIcon,
} from './Icons';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PlatformSelectorProps {
    selectedPlatform: string | null;
    onSelectPlatform?: (platform: string) => void;
    disabled?: boolean;
}

// Platform definitions with gradients and colors
const PLATFORMS = [
    { id: 'youtube', Icon: YouTubeIcon, color: '#FF0000', gradient: ['#FF0000', '#FF4D4D'] },
    { id: 'instagram', Icon: InstagramIcon, color: '#E1306C', gradient: ['#833AB4', '#FD1D1D', '#F77737'] },
    { id: 'tiktok', Icon: TikTokIcon, color: '#00F2EA', gradient: ['#00F2EA', '#FF0050'] },
    { id: 'facebook', Icon: FacebookIcon, color: '#1877F2', gradient: ['#1877F2', '#3b5998'] },
    { id: 'spotify', Icon: SpotifyIcon, color: '#1DB954', gradient: ['#1DB954', '#1ED760'] },
    { id: 'x', Icon: XIcon, color: '#FFFFFF', gradient: ['#000000', '#333333'] },
    { id: 'pinterest', Icon: PinterestIcon, color: '#E60023', gradient: ['#E60023', '#BD081C'] },
    { id: 'soundcloud', Icon: SoundCloudIcon, color: '#FF5500', gradient: ['#FF5500', '#FF3300'] },
];

interface PlatformItemProps {
    platform: typeof PLATFORMS[0];
    isSelected: boolean;
    onPress: () => void;
    disabled?: boolean;
}

const PlatformItem: React.FC<PlatformItemProps> = ({ platform, isSelected, onPress, disabled }) => {
    // Animation for inner visual elements (opacity, scale)
    // We use native driver for best performance
    const anim = useRef(new Animated.Value(isSelected ? 1 : 0)).current;

    useEffect(() => {
        Animated.spring(anim, {
            toValue: isSelected ? 1 : 0,
            friction: 8,
            tension: 50,
            useNativeDriver: true,
        }).start();
    }, [isSelected]);

    // Interpolations for visual effects
    const iconScale = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1.1]
    });

    const activeOpacity = anim;

    // Invert opacity for inactive elements
    const inactiveOpacity = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0]
    });

    // Create a unique ID string for the gradient
    const gradId = `grad_${platform.id}`;

    // Conditional styling for the container (LayoutAnimation handles the transition between these)
    const containerStyle = isSelected ? styles.itemActive : styles.itemInactive;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.9}
            disabled={disabled}
            style={styles.touchableWrapper}
        >
            <View style={[styles.itemRef, containerStyle]}>

                {/* 1. Base Dark Background (Visible when inactive) */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.inactiveBackground, { opacity: inactiveOpacity }]}>
                    <View style={styles.inactiveBorder} />
                </Animated.View>

                {/* 2. Gradient Overlay (Visible when active) */}
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: activeOpacity }]}>
                    <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
                        <Defs>
                            <LinearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
                                <Stop offset="0" stopColor={platform.gradient[0]} stopOpacity="1" />
                                <Stop offset="0.5" stopColor={platform.gradient[1]} stopOpacity="1" />
                                <Stop offset="1" stopColor={platform.gradient[2] || platform.gradient[1]} stopOpacity="1" />
                            </LinearGradient>
                        </Defs>
                        <Rect x="0" y="0" width="100%" height="100%" rx={isSelected ? 20 : 16} ry={isSelected ? 20 : 16} fill={`url(#${gradId})`} />
                    </Svg>
                    {/* Extra Glow for pop */}
                    <View style={[styles.glow, { backgroundColor: platform.gradient[0] }]} />
                </Animated.View>

                {/* 3. Icon Content */}
                <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                    {/* Inactive Icon (Color) */}
                    <Animated.View style={[styles.iconCenter, { opacity: inactiveOpacity }]}>
                        <platform.Icon size={24} color={platform.color} />
                    </Animated.View>

                    {/* Active Icon (White) */}
                    <Animated.View style={[styles.iconCenter, { opacity: activeOpacity }]}>
                        <platform.Icon size={28} color="#FFFFFF" />
                    </Animated.View>
                </Animated.View>

            </View>
        </TouchableOpacity>
    );
};

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
    selectedPlatform,
    onSelectPlatform,
    disabled = false,
}) => {
    // Local state for immediate feedback
    const [localSelected, setLocalSelected] = React.useState(selectedPlatform);

    // Sync local state with prop when prop changes (e.g. auto-detection)
    useEffect(() => {
        setLocalSelected(selectedPlatform);
    }, [selectedPlatform]);

    const handleSelect = (id: string) => {
        if (disabled || localSelected === id) return;

        // Immediate visual feedback
        setLocalSelected(id);
        Haptics.impact();

        // Configure smooth layout animation
        LayoutAnimation.configureNext({
            duration: 300,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut, // Smoother than spring for layout
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });

        // Propagate to parent
        onSelectPlatform?.(id);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                keyboardShouldPersistTaps="handled"
            >
                {PLATFORMS.map((platform) => {
                    // Match against local state for instant response
                    const isSelected = localSelected?.toLowerCase() === platform.id ||
                        (localSelected?.toLowerCase() === 'twitter' && platform.id === 'x');

                    return (
                        <PlatformItem
                            key={platform.id}
                            platform={platform}
                            isSelected={!!isSelected}
                            onPress={() => handleSelect(platform.id)}
                            disabled={disabled}
                        />
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
    },
    scrollContent: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 12, // More padding for shadow clipping
        gap: 12,
        alignItems: 'center',
    },
    touchableWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemRef: {
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', // IMPORTANT: keeps rounded corners clean
    },
    itemInactive: {
        width: 50, // Slightly more compact
        height: 50,
        borderRadius: 14,
    },
    itemActive: {
        width: 60,
        height: 60,
        borderRadius: 18,
    },
    inactiveBackground: {
        backgroundColor: Colors.surfaceMedium,
        borderRadius: 14,
    },
    inactiveBorder: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        borderRadius: 14,
    },
    glow: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.25, // More subtle industrial glow
        zIndex: -1,
    },
    iconCenter: {
        position: 'absolute',
        width: 30,
        height: 30,
        marginLeft: -15, // center using negative margin relative to center point
        marginTop: -15,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default PlatformSelector;
