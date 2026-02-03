import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { VideoIcon, MusicIcon } from './Icons';

interface FormatToggleProps {
    mode: 'video' | 'audio';
    onModeChange: (mode: 'video' | 'audio') => void;
    platformColor?: string;
}

export const FormatToggle: React.FC<FormatToggleProps> = ({ mode, onModeChange, platformColor = Colors.primary }) => {
    const [anim] = useState(new Animated.Value(mode === 'video' ? 0 : 1));

    useEffect(() => {
        Animated.timing(anim, {
            toValue: mode === 'video' ? 0 : 1,
            duration: 250,
            useNativeDriver: false,
        }).start();
    }, [mode]);

    const left = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [2, 50], // Adjust based on width
    });

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Mode</Text>
            <View style={styles.toggleContainer}>
                <Animated.View style={[styles.slider, { left, backgroundColor: platformColor }]} />

                <TouchableOpacity
                    style={styles.option}
                    onPress={() => onModeChange('video')}
                    activeOpacity={0.8}
                >
                    <VideoIcon size={16} color={mode === 'video' ? Colors.textPrimary : Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.option}
                    onPress={() => onModeChange('audio')}
                    activeOpacity={0.8}
                >
                    <MusicIcon size={16} color={mode === 'audio' ? Colors.textPrimary : Colors.textMuted} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    label: {
        fontSize: Typography.sizes.xs,
        color: Colors.textMuted,
        fontWeight: Typography.weights.semibold,
    },
    toggleContainer: {
        width: 100,
        height: 36,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceElevated,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 2,
        position: 'relative',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    slider: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        width: 48,
        borderRadius: BorderRadius.round - 2,
    },
    option: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
});
