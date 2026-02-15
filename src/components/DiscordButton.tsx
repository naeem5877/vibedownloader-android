import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Linking, StyleSheet, Animated, Easing, View, Text } from 'react-native';
import { Colors, BorderRadius } from '../theme';
import { DiscordIcon } from './Icons';

const DISCORD_INVITE_URL = 'https://discord.gg/vibedownloader';

interface DiscordButtonProps {
    compact?: boolean;
}

export const DiscordButton: React.FC<DiscordButtonProps> = ({ compact = false }) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 1800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const handlePress = () => {
        Linking.openURL(DISCORD_INVITE_URL).catch(console.error);
    };

    if (compact) {
        return (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                    onPress={handlePress}
                    activeOpacity={0.7}
                    style={styles.compactButton}
                >
                    <DiscordIcon size={20} color="#FFF" />
                </TouchableOpacity>
            </Animated.View>
        );
    }

    return (
        <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.85}
                style={styles.button}
            >
                <View style={styles.iconBg}>
                    <DiscordIcon size={20} color="#FFF" />
                </View>
                <Text style={styles.label}>Join Discord</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#5865F2',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 10,
        shadowColor: '#5865F2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    iconBg: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: 0.2,
    },
    compactButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#5865F2',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#5865F2',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
});

export default DiscordButton;
