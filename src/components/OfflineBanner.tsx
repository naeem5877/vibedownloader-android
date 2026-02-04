import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, Typography, Shadows, BorderRadius } from '../theme';

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

export const OfflineBanner = () => {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const slideAnim = useRef(new Animated.Value(-100)).current;

    useEffect(() => {
        // If NetInfo is missing, assume always online and do nothing
        if (!NetInfo) return;

        const unsubscribe = NetInfo.addEventListener((state: any) => {
            const online = state.isConnected;
            setIsConnected(online);

            Animated.spring(slideAnim, {
                toValue: online === false ? 0 : -100,
                friction: 8,
                useNativeDriver: true,
            }).start();
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.content}>
                <Text style={styles.icon}>🌩️</Text>
                <View style={styles.textContainer}>
                    <Text style={styles.title}>You are offline</Text>
                    <Text style={styles.message}>Connect to the internet to download content</Text>
                </View>
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
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.lg,
        elevation: 10,
    },
    icon: {
        fontSize: 24,
        marginRight: Spacing.md,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        color: Colors.textPrimary,
        fontWeight: 'bold',
        fontSize: Typography.sizes.sm,
        marginBottom: 2,
    },
    message: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xs,
    }
});
