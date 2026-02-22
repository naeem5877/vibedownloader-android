import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Easing } from 'react-native';
import { Colors, Spacing, Typography, Shadows, BorderRadius } from '../theme';
import { LibraryIcon } from './Icons';

// Safe Import for NetInfo to prevent crashes if package is missing
let NetInfo: any;
try {
    // Try to require the module
    NetInfo = require('@react-native-community/netinfo');
    // Handle ES Module default export if necessary
    if (NetInfo && NetInfo.default) {
        NetInfo = NetInfo.default;
    }
} catch (e) {
    console.warn('NetInfo package not installed. Offline detection disabled.');
    NetInfo = null;
}

interface OfflineBannerProps {
    onActionPress?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onActionPress }) => {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const slideAnim = useRef(new Animated.Value(-120)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // If NetInfo is missing, assume always online and do nothing
        if (!NetInfo) return;

        const unsubscribe = NetInfo.addEventListener((state: any) => {
            const online = state.isConnected;
            setIsConnected(online);

            Animated.spring(slideAnim, {
                toValue: online === false ? 0 : -120,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        });

        // Pulse Animation for Offline Indicator
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.5,
                    duration: 1500,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 0,
                    useNativeDriver: true,
                })
            ])
        ).start();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    if (isConnected === true) return null;

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.content}>
                <View style={styles.indicatorContainer}>
                    <Text style={styles.icon}>📡</Text>
                    <Animated.View
                        style={[
                            styles.pulse,
                            {
                                transform: [{ scale: pulseAnim }],
                                opacity: pulseAnim.interpolate({
                                    inputRange: [1, 1.5],
                                    outputRange: [0.6, 0]
                                })
                            }
                        ]}
                    />
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title}>You are offline</Text>
                    <Text style={styles.message}>Connect to download, or view library</Text>
                </View>

                {onActionPress && (
                    <TouchableOpacity
                        onPress={onActionPress}
                        style={styles.actionButton}
                        activeOpacity={0.7}
                    >
                        <LibraryIcon size={14} color={Colors.primary} />
                        <Text style={styles.actionText}>LIBRARY</Text>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        paddingHorizontal: 12,
        paddingTop: 12,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 69, 58, 0.3)',
        ...Shadows.lg,
        elevation: 10,
    },
    indicatorContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    pulse: {
        position: 'absolute',
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255, 69, 58, 0.4)',
    },

    icon: {
        fontSize: 20,
    },
    textContainer: {
        flex: 1,
        marginLeft: 4,
    },
    title: {
        color: Colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 13,
        marginBottom: 1,
    },
    message: {
        color: Colors.textMuted,
        fontSize: 11,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginLeft: 8,
    },
    actionText: {
        color: Colors.primary,
        fontSize: 10,
        fontWeight: 'bold',
        marginLeft: 4,
    }
});
