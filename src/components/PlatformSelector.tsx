/**
 * Premium PlatformSelector - Horizontal list with animated selection
 */
import React, { useRef, useEffect } from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
    Text,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Shadows, SUPPORTED_PLATFORMS, Typography } from '../theme';
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

interface PlatformSelectorProps {
    selectedPlatform: string | null;
    onSelectPlatform?: (platform: string) => void;
    disabled?: boolean;
}

const getIconComponent = (platformId: string) => {
    switch (platformId.toLowerCase()) {
        case 'youtube': return YouTubeIcon;
        case 'instagram': return InstagramIcon;
        case 'tiktok': return TikTokIcon;
        case 'facebook': return FacebookIcon;
        case 'spotify': return SpotifyIcon;
        case 'x':
        case 'twitter': return XIcon;
        case 'pinterest': return PinterestIcon;
        case 'soundcloud': return SoundCloudIcon;
        default: return YouTubeIcon;
    }
};

interface PlatformButtonProps {
    platform: typeof SUPPORTED_PLATFORMS[number];
    isSelected: boolean;
    onPress: () => void;
    disabled: boolean;
    index: number;
}

const PlatformButton: React.FC<PlatformButtonProps> = ({
    platform,
    isSelected,
    onPress,
    disabled,
    index
}) => {
    const IconComponent = getIconComponent(platform.id);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        if (disabled) return;
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handlePressOut = () => {
        if (disabled) return;
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    return (
        <Animated.View
            style={{
                transform: [{ scale: scaleAnim }],
                opacity: disabled ? 0.4 : 1,
            }}
        >
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.7}
                disabled={disabled}
                style={styles.platformButtonContainer}
            >
                <View
                    style={[
                        styles.platformButton,
                        isSelected && styles.platformButtonSelected,
                        { borderColor: isSelected ? platform.color : Colors.border },
                    ]}
                >
                    <IconComponent
                        size={32}
                        color={isSelected ? platform.color : Colors.textSecondary}
                    />
                </View>

                <Text
                    style={[
                        styles.platformName,
                        isSelected && {
                            color: platform.color,
                            fontWeight: Typography.weights.bold
                        }
                    ]}
                    numberOfLines={1}
                >
                    {platform.label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
    selectedPlatform,
    onSelectPlatform,
    disabled = false,
}) => {
    return (
        <View style={styles.selectorWrapper}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContainer}
                decelerationRate="fast"
            >
                {SUPPORTED_PLATFORMS.map((platform, index) => {
                    const isSelected = selectedPlatform?.toLowerCase() === platform.id.toLowerCase();
                    return (
                        <PlatformButton
                            key={platform.id}
                            platform={platform}
                            isSelected={isSelected}
                            onPress={() => {
                                console.log('Platform pressed:', platform.id);
                                onSelectPlatform?.(platform.id);
                            }}
                            disabled={disabled}
                            index={index}
                        />
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    selectorWrapper: {
        marginBottom: Spacing.lg,
        marginTop: Spacing.md,
    },
    scrollContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
    },
    platformButtonContainer: {
        alignItems: 'center',
        gap: 8,
    },
    platformButton: {
        width: 72,
        height: 72,
        borderRadius: BorderRadius.xl,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: Colors.border,
        ...Shadows.lg,
    },
    platformButtonSelected: {
        backgroundColor: Colors.surfaceElevated,
        borderWidth: 3,
    },
    platformName: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.xs,
        textAlign: 'center',
        fontWeight: Typography.weights.semibold,
        maxWidth: 80,
    },
});

export default PlatformSelector;
