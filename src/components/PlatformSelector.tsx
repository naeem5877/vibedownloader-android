/**
 * PlatformSelector - Horizontal list of platform icons
 */
import React from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Shadows, SUPPORTED_PLATFORMS } from '../theme';
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
}

const getIconComponent = (platformId: string) => {
    switch (platformId) {
        case 'youtube':
            return YouTubeIcon;
        case 'instagram':
            return InstagramIcon;
        case 'tiktok':
            return TikTokIcon;
        case 'facebook':
            return FacebookIcon;
        case 'spotify':
            return SpotifyIcon;
        case 'twitter':
            return XIcon;
        case 'pinterest':
            return PinterestIcon;
        case 'soundcloud':
            return SoundCloudIcon;
        default:
            return YouTubeIcon;
    }
};

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
    selectedPlatform,
    onSelectPlatform,
}) => {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {SUPPORTED_PLATFORMS.map((platform) => {
                const isSelected = selectedPlatform?.toLowerCase() === platform.name.toLowerCase() ||
                    selectedPlatform?.toLowerCase() === platform.id;
                const IconComponent = getIconComponent(platform.id);

                return (
                    <TouchableOpacity
                        key={platform.id}
                        style={[
                            styles.platformButton,
                            isSelected && styles.platformButtonSelected,
                            isSelected && { backgroundColor: platform.color },
                        ]}
                        onPress={() => onSelectPlatform?.(platform.id)}
                        activeOpacity={0.7}
                    >
                        <IconComponent
                            size={24}
                            color={isSelected ? Colors.textPrimary : platform.color}
                        />
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
    },
    platformButton: {
        width: 52,
        height: 52,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.sm,
    },
    platformButtonSelected: {
        borderColor: 'transparent',
        ...Shadows.md,
    },
});

export default PlatformSelector;
