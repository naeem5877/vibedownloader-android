
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

const CURRENT_VERSION = '1.0.7';
const VERSION_KEY = 'last_seen_version';

interface ChangeItem {
    emoji: string;
    title: string;
    description: string;
}

const CHANGES: ChangeItem[] = [
    { emoji: '✨', title: 'New Visuals', description: 'Complete modern UI redesign with glassmorphism and animations.' },
    { emoji: '🚀', title: 'Smoother', description: 'Better animations, transitions, and micro-interactions.' },
    { emoji: '🎨', title: 'Discord', description: 'Join our community directly from the app header.' },
    { emoji: '🎵', title: 'Audio Fix', description: 'Improved audio download stability with album art embedding.' },
    { emoji: '🐛', title: 'Bug Fixes', description: 'Enhanced download reliability across all platforms.' },
];

const ChangeRow: React.FC<{ item: ChangeItem; index: number }> = ({ item, index }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                delay: index * 80,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 400,
                delay: index * 80,
                easing: Easing.out(Easing.cubic),
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
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        checkVersion();
    }, []);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 9,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
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
                toValue: 0.85,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
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
                            <SparkleIcon size={28} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.headerTitle}>What's New</Text>
                            <Text style={styles.headerVersion}>v{CURRENT_VERSION}</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <CloseIcon size={20} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Changes List */}
                    <ScrollView
                        style={styles.changesList}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    >
                        {CHANGES.map((item, index) => (
                            <ChangeRow key={index} item={item} index={index} />
                        ))}
                    </ScrollView>

                    {/* Action Button */}
                    <TouchableOpacity onPress={handleClose} style={styles.actionBtn} activeOpacity={0.85}>
                        <Text style={styles.actionBtnText}>Awesome! 🎉</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        width: width - 48,
        maxWidth: 380,
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: Colors.border,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.15,
        shadowRadius: 32,
        elevation: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: `${Colors.primary}15`,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    headerIconGlow: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: Colors.primary,
        opacity: 0.1,
    },
    headerText: {
        flex: 1,
        marginLeft: 14,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    headerVersion: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.primary,
        marginTop: 2,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: Colors.surfaceHover,
        justifyContent: 'center',
        alignItems: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 18,
    },
    changesList: {
        maxHeight: 300,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    changeEmoji: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: `${Colors.primary}10`,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    emojiText: {
        fontSize: 18,
    },
    changeContent: {
        flex: 1,
    },
    changeTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 3,
    },
    changeDescription: {
        fontSize: 13,
        color: Colors.textMuted,
        lineHeight: 18,
    },
    actionBtn: {
        marginTop: 8,
        backgroundColor: Colors.primary,
        paddingVertical: 15,
        borderRadius: 14,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    actionBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.3,
    },
});
