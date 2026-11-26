import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Shadows, BorderRadius } from '../theme';
import { LibraryIcon, WifiOffIcon } from './Icons';

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

/** Far enough off-screen to hide the pill even under a tall camera cutout. */
const HIDDEN_Y = -200;

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onActionPress }) => {
    const insets = useSafeAreaInsets();
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const slideAnim = useRef(new Animated.Value(HIDDEN_Y)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // If NetInfo is missing, assume always online and do nothing
        if (!NetInfo) return;

        const unsubscribe = NetInfo.addEventListener((state: any) => {
            const online = state.isConnected;
            setIsConnected(online);

            Animated.spring(slideAnim, {
                toValue: online === false ? 0 : HIDDEN_Y,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
        // slideAnim is a stable ref value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pulse animation for the offline indicator. Only runs while the banner is
    // actually shown, so an online app does not keep a native animation looping.
    useEffect(() => {
        if (isConnected !== false) return;

        pulseAnim.setValue(1);
        const pulseLoop = Animated.loop(
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
        );
        pulseLoop.start();

        return () => {
            pulseLoop.stop();
        };
    }, [isConnected, pulseAnim]);

    const pulseOpacity = useMemo(
        () => pulseAnim.interpolate({ inputRange: [1, 1.5], outputRange: [0.6, 0] }),
        [pulseAnim],
    );

    // Hidden while online and while the state is still unknown (null).
    if (isConnected !== false) return null;

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[
                styles.container,
                { paddingTop: insets.top + 8, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <View style={styles.content}>
                <View style={styles.indicatorContainer}>
                    <Animated.View
                        style={[
                            styles.pulse,
                            {
                                transform: [{ scale: pulseAnim }],
                                opacity: pulseOpacity
                            }
                        ]}
                    />
                    <WifiOffIcon size={17} color={Colors.textPrimary} />
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title}>You’re offline</Text>
                    <Text style={styles.message}>Downloads are paused</Text>
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
        // paddingTop is set at render time from the safe-area inset.
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(19, 19, 22, 0.96)',
        borderRadius: 18,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.28)',
        ...Shadows.lg,
        elevation: 10,
    },
    indicatorContainer: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    pulse: {
        position: 'absolute',
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.5)',
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
