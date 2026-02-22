
import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    ScrollView,
    Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, BorderRadius, Spacing, Typography } from '../theme';
import { SparkleIcon, CloseIcon } from './Icons';

const { width } = Dimensions.get('window');

const CURRENT_VERSION = '1.1.0';
const VERSION_KEY = 'last_seen_version';

interface ChangeItem {
    emoji: string;
    title: string;
    description: string;
}

const CHANGES: ChangeItem[] = [
    { emoji: '💎', title: 'Industrial Overhaul', description: 'Complete premium redesign with atmospheric surfaces and depth.' },
    { emoji: '📊', title: 'Asset Manager', description: 'Advanced library with segmented storage and platform folders.' },
    { emoji: '⚡', title: 'Haptic Engine', description: 'Mechanical tactile feedback for a more responsive physical feel.' },
    { emoji: '🎬', title: 'Signature Splash', description: 'Cinematic entry experience with atmospheric industrial motion.' },
    { emoji: '🛠️', title: 'Optimization', description: 'Refined typography and industrial layout across all components.' },
];

const ChangeRow: React.FC<{ item: ChangeItem; index: number }> = ({ item, index }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(15)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                delay: 400 + index * 100,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 500,
                delay: 400 + index * 100,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.changeRow,
                {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                },
            ]}
        >
            <View style={styles.changeEmoji}>
                <Text style={styles.emojiText}>{item.emoji}</Text>
            </View>
            <View style={styles.changeContent}>
                <Text style={styles.changeTitle}>{item.title}</Text>
                <Text style={styles.changeDescription}>{item.description}</Text>
            </View>
        </Animated.View>
    );
};

export const UpdateLog = () => {
    const [visible, setVisible] = useState(false);
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        checkVersion();
    }, []);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 60,
                    friction: 10,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 350,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const checkVersion = async () => {
        try {
            const lastSeen = await AsyncStorage.getItem(VERSION_KEY);
            if (lastSeen !== CURRENT_VERSION) {
                setVisible(true);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleClose = async () => {
        Animated.parallel([
            Animated.timing(scaleAnim, {
                toValue: 0.9,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(async () => {
            setVisible(false);
            await AsyncStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        });
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <Animated.View
                    style={[
                        styles.container,
                        {
                            opacity: fadeAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIconContainer}>
                            <View style={styles.headerIconGlow} />
                            <SparkleIcon size={24} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.headerSubtitle}>SYSTEM UPDATE</Text>
                            <Text style={styles.headerTitle}>VibeDownloader v{CURRENT_VERSION}</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <CloseIcon size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Technical Info */}
                    <View style={styles.techInfo}>
                        <Text style={styles.techText}>STABLE BUILD • AESTHETIC OVERHAUL</Text>
                    </View>

                    {/* Changes List */}
                    <ScrollView
                        style={styles.changesList}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.changesContent}
                    >
                        {CHANGES.map((item, index) => (
                            <ChangeRow key={index} item={item} index={index} />
                        ))}
                    </ScrollView>

                    {/* Action Button */}
                    <TouchableOpacity onPress={handleClose} style={styles.actionBtn} activeOpacity={0.8}>
                        <Text style={styles.actionBtnText}>ACCESS UPDATED SYSTEM</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: `${Colors.primary}10`,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    headerIconGlow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 12,
        backgroundColor: Colors.primary,
        opacity: 0.1,
    },
    headerText: {
        flex: 1,
        marginLeft: 14,
    },
    headerSubtitle: {
        fontSize: 9,
        fontWeight: Typography.weights.black,
        color: Colors.primary,
        letterSpacing: 1.5,
        marginBottom: 2,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    techInfo: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.03)',
    },
    techText: {
        fontSize: 9,
        color: Colors.textMuted,
        fontWeight: Typography.weights.bold,
        letterSpacing: 1,
        textAlign: 'center',
    },
    changesList: {
        maxHeight: 340,
    },
    changesContent: {
        paddingVertical: 4,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.02)',
    },
    changeEmoji: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: Colors.surfaceMedium,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    emojiText: {
        fontSize: 20,
    },
    changeContent: {
        flex: 1,
    },
    changeTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        marginBottom: 2,
        letterSpacing: Typography.letterSpacing.normal,
    },
    changeDescription: {
        fontSize: 11,
        color: Colors.textMuted,
        lineHeight: 16,
        fontWeight: Typography.weights.medium,
    },
    actionBtn: {
        marginTop: 24,
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    actionBtnText: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
});
