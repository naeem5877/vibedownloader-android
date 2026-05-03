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
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SparkleIcon, CloseIcon, CheckIcon, StarIcon } from './Icons';

const { width } = Dimensions.get('window');

const CURRENT_VERSION = '1.4.0';
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
        description: 'You can now log in directly within the app to download private videos and restricted content.',
        tag: 'New Feature',
        tagColor: Colors.primary,
    },
    {
        emoji: '📱',
        title: 'Story Downloads',
        description: 'Added support for downloading Instagram and Facebook stories natively.',
        tag: 'New Feature',
        tagColor: '#8B5CF6',
    },
    {
        emoji: '🎵',
        title: 'Spotify Fixes',
        description: 'Fixed metadata fetching errors when downloading from Spotify.',
        tag: 'Bug Fix',
        tagColor: '#1DB954',
    },
    {
        emoji: '🗂️',
        title: 'Library Overhaul',
        description: 'Fixed bugs in the Library screen. Content is now perfectly categorized into Videos, Images, and Posts.',
        tag: 'Improvement',
        tagColor: '#F59E0B',
    },
    {
        emoji: '⚙️',
        title: 'New Settings',
        description: 'Added Auto-paste clipboard toggle and Haptic Feedback controls.',
        tag: 'Settings',
        tagColor: '#6366F1',
    },
    {
        emoji: '✨',
        title: 'Material 3 UI',
        description: 'Upgraded interface with more Material 3 elements and fixed several visual bugs.',
        tag: 'Design',
        tagColor: '#EC4899',
    },
    {
        emoji: '🛠️',
        title: 'Under the Hood',
        description: 'Crushed various logic bugs and improved overall app stability.',
        tag: 'Optimization',
        tagColor: '#10B981',
    },
];

const ChangeRow: React.FC<{ item: ChangeItem; index: number }> = ({ item, index }) => {
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                delay: 300 + index * 80,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 400,
                delay: 300 + index * 80,
                easing: Easing.out(Easing.back(1.2)),
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View style={[styles.changeRow, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Emoji chip */}
            <View style={styles.emojiChip}>
                <Text style={styles.emojiText}>{item.emoji}</Text>
            </View>

            <View style={styles.changeContent}>
                <View style={styles.changeTitleRow}>
                    <Text style={styles.changeTitle}>{item.title}</Text>
                    {item.tag && (
                        <View style={[styles.tagChip, { backgroundColor: `${item.tagColor}22`, borderColor: `${item.tagColor}50` }]}>
                            <Text style={[styles.tagText, { color: item.tagColor }]}>{item.tag}</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.changeDescription}>{item.description}</Text>
            </View>
        </Animated.View>
    );
};

export const UpdateLog = () => {
    const [visible, setVisible] = useState(false);
    const scaleAnim   = useRef(new Animated.Value(0.92)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const slideAnim   = useRef(new Animated.Value(40)).current;

    useEffect(() => { checkVersion(); }, []);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 70,
                    friction: 12,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 280,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 320,
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
            Animated.timing(scaleAnim, { toValue: 0.92, duration: 220, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 30, duration: 220, useNativeDriver: true }),
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
                        { opacity: opacityAnim, transform: [{ scale: scaleAnim }, { translateY: slideAnim }] },
                    ]}
                >
                    {/* Decorative glow blob */}
                    <View style={styles.glowBlob} />

                    {/* ── Header ── */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.versionBadge}>
                                <Text style={styles.versionBadgeText}>v{CURRENT_VERSION}</Text>
                            </View>
                            <View style={styles.headerIconWrap}>
                                <SparkleIcon size={22} color={Colors.primary} />
                            </View>
                            <View>
                                <Text style={styles.headerLabel}>WHAT'S NEW</Text>
                                <Text style={styles.headerTitle}>VibeDownloader</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <CloseIcon size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Divider ── */}
                    <View style={styles.divider} />

                    {/* ── Changes list ── */}
                    <ScrollView
                        style={styles.changesList}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.changesContent}
                    >
                        {CHANGES.map((item, i) => (
                            <ChangeRow key={i} item={item} index={i} />
                        ))}
                    </ScrollView>

                    {/* ── Footer actions ── */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => Linking.openURL('https://github.com/naeem5877/vibedownloader-android')}
                        >
                            <StarIcon size={14} color="#FFD700" />
                            <Text style={styles.secondaryBtnText}>Star on GitHub</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleClose} style={styles.primaryBtn} activeOpacity={0.85}>
                            <CheckIcon size={16} color="#FFF" />
                            <Text style={styles.primaryBtnText}>Let's Go!</Text>
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    glowBlob: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: Colors.primary,
        opacity: 0.06,
        top: -80,
        right: -60,
    },
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 14,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    versionBadge: {
        backgroundColor: `${Colors.primary}25`,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: `${Colors.primary}40`,
    },
    versionBadgeText: {
        color: Colors.primary,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    headerIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: `${Colors.primary}18`,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: `${Colors.primary}30`,
    },
    headerLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: Colors.primary,
        letterSpacing: 1.8,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '900',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.innerBorder,
        marginHorizontal: 0,
    },
    // ── Changes ──
    changesList: { maxHeight: 320 },
    changesContent: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 4,
        gap: 10,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.025)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    emojiChip: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: Colors.surfaceMedium,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        flexShrink: 0,
    },
    emojiText: { fontSize: 19 },
    changeContent: { flex: 1 },
    changeTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3,
        flexWrap: 'wrap',
    },
    changeTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.1,
    },
    tagChip: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    tagText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    changeDescription: {
        fontSize: 11.5,
        color: Colors.textMuted,
        lineHeight: 17,
        fontWeight: '500',
    },
    // ── Footer ──
    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorder,
    },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 13,
        borderRadius: 16,
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
        borderRadius: 16,
        backgroundColor: Colors.primary,
        ...Shadows.glow(Colors.primary),
    },
    primaryBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
});
