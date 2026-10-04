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
    Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '../theme';
import { SparkleIcon, CloseIcon, CheckIcon, StarIcon } from './Icons';

const { width } = Dimensions.get('window');

const CURRENT_VERSION = '1.3.0';
const VERSION_KEY = 'last_seen_version';

interface ChangeItem {
    emoji: string;
    title: string;
    description: string;
    tag?: string;
    tagColor?: string;
}

const CHANGES: ChangeItem[] = [
    {
        emoji: '🔐',
        title: 'Login & Private Downloads',
        description: 'Log in inside the app to download private videos and restricted content.',
        tag: 'New',
        tagColor: Colors.primary,
    },
    {
        emoji: '📱',
        title: 'Story Downloads',
        description: 'Native support for Instagram and Facebook stories.',
        tag: 'New',
        tagColor: '#8B5CF6',
    },
    {
        emoji: '🎵',
        title: 'Spotify Fixes',
        description: 'Fixed metadata errors when downloading from Spotify.',
        tag: 'Fix',
        tagColor: '#1DB954',
    },
    {
        emoji: '🗂️',
        title: 'Library Overhaul',
        description: 'Library bugs fixed. Content sorted into Videos, Images, and Posts.',
        tag: 'Improved',
        tagColor: '#F59E0B',
    },
    {
        emoji: '⚙️',
        title: 'New Settings',
        description: 'Auto-paste clipboard toggle and haptic feedback controls.',
        tag: 'Settings',
        tagColor: '#6366F1',
    },
    {
        emoji: '✨',
        title: 'Material 3 UI',
        description: 'More Material 3 elements and several visual bug fixes.',
        tag: 'Design',
        tagColor: '#EC4899',
    },
    {
        emoji: '🛠️',
        title: 'Under the Hood',
        description: 'Logic bugs crushed and overall stability improved.',
        tag: 'Stability',
        tagColor: '#10B981',
    },
];

const ChangeRow: React.FC<{ item: ChangeItem; index: number }> = ({ item, index }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 350,
                delay: 220 + index * 55,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 350,
                delay: 220 + index * 55,
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
                    borderLeftColor: item.tagColor || Colors.primary,
                },
            ]}
        >
            <Text style={styles.emojiText}>{item.emoji}</Text>

            <View style={styles.changeContent}>
                <View style={styles.changeTitleRow}>
                    <Text style={styles.changeTitle} numberOfLines={1}>
                        {item.title}
                    </Text>
                    {item.tag ? (
                        <View
                            style={[
                                styles.tagChip,
                                {
                                    backgroundColor: `${item.tagColor}18`,
                                    borderColor: `${item.tagColor}40`,
                                },
                            ]}
                        >
                            <Text style={[styles.tagText, { color: item.tagColor }]}>
                                {item.tag}
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text style={styles.changeDescription}>{item.description}</Text>
            </View>
        </Animated.View>
    );
};

export const UpdateLog = () => {
    const [visible, setVisible] = useState(false);
    const scaleAnim = useRef(new Animated.Value(0.94)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(28)).current;

    useEffect(() => {
        checkVersion();
    }, []);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 80,
                    friction: 12,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 260,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const checkVersion = async () => {
        try {
            const lastSeen = await AsyncStorage.getItem(VERSION_KEY);
            if (lastSeen !== CURRENT_VERSION) setVisible(true);
        } catch (e) {}
    };

    const handleClose = async () => {
        Animated.parallel([
            Animated.timing(scaleAnim, {
                toValue: 0.94,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 20,
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
            <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
                <Animated.View
                    style={[
                        styles.container,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Soft top glow */}
                    <View style={styles.glowBlob} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIconWrap}>
                            <SparkleIcon size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.headerLabel}>WHAT'S NEW</Text>
                            <Text style={styles.headerTitle}>Version {CURRENT_VERSION}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.closeBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <CloseIcon size={16} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    {/* Changes */}
                    <ScrollView
                        style={styles.changesList}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.changesContent}
                        bounces={false}
                    >
                        {CHANGES.map((item, i) => (
                            <ChangeRow key={i} item={item} index={i} />
                        ))}
                    </ScrollView>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() =>
                                Linking.openURL(
                                    'https://github.com/naeem5877/vibedownloader-android',
                                )
                            }
                            activeOpacity={0.7}
                        >
                            <StarIcon size={14} color="#FFD700" />
                            <Text style={styles.secondaryBtnText}>Star</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.primaryBtn}
                            activeOpacity={0.85}
                        >
                            <CheckIcon size={16} color="#FFF" />
                            <Text style={styles.primaryBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.88)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    container: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    glowBlob: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: Colors.primary,
        opacity: 0.07,
        top: -70,
        alignSelf: 'center',
        left: width / 2 - 110,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 14,
        gap: 12,
    },
    headerIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: `${Colors.primary}18`,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: `${Colors.primary}30`,
    },
    headerText: {
        flex: 1,
    },
    headerLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 1.4,
        marginBottom: 2,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: Colors.innerBorder,
    },
    changesList: {
        maxHeight: 340,
    },
    changesContent: {
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 8,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        borderLeftWidth: 3,
    },
    emojiText: {
        fontSize: 18,
        marginTop: 1,
        width: 26,
        textAlign: 'center',
    },
    changeContent: {
        flex: 1,
        minWidth: 0,
    },
    changeTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3,
        flexWrap: 'nowrap',
    },
    changeTitle: {
        fontSize: 13.5,
        fontWeight: '700',
        color: Colors.textPrimary,
        letterSpacing: -0.15,
        flexShrink: 1,
    },
    tagChip: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        flexShrink: 0,
    },
    tagText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    changeDescription: {
        fontSize: 12,
        color: Colors.textMuted,
        lineHeight: 17,
        fontWeight: '500',
    },
    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.innerBorder,
    },
    secondaryBtn: {
        flex: 0.85,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 13,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    secondaryBtnText: {
        color: Colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
    },
    primaryBtn: {
        flex: 1.4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 13,
        borderRadius: 14,
        backgroundColor: Colors.primary,
        ...Shadows.glow(Colors.primary),
    },
    primaryBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.15,
    },
});
