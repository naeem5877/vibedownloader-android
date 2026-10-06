/**
 * "What's new" sheet shown once after the app has been updated.
 *
 * The version is what is actually installed and the notes are that version's
 * GitHub release, so this can never drift from the app the way the old
 * hardcoded 1.3.0 list did. Fresh installs are not shown it, and if the notes
 * cannot be fetched (offline) it stays quiet and tries again next launch.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    ScrollView,
    Linking,
    useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '../theme';
import { SparkleIcon, CloseIcon, CheckIcon, StarIcon } from './Icons';
import { ReleaseNotesView } from './ReleaseNotesView';
import {
    getInstalledApp,
    fetchReleaseNotes,
    ReleaseInfo,
} from '../services/GitHubUpdateService';
import { acquireTabSwipeLock } from '../utils/tabSwipeLock';

const VERSION_KEY = 'last_seen_version';
const REPO_URL = 'https://github.com/naeem5877/vibedownloader-android';

export const UpdateLog = () => {
    const { height } = useWindowDimensions();
    const [visible, setVisible] = useState(false);
    const [release, setRelease] = useState<ReleaseInfo | null>(null);
    const [version, setVersion] = useState('');
    const scaleAnim = useRef(new Animated.Value(0.94)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(28)).current;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const installed = await getInstalledApp();
                const lastSeen = await AsyncStorage.getItem(VERSION_KEY);

                // Fresh install: nothing changed from the user's point of view.
                if (lastSeen === null) {
                    await AsyncStorage.setItem(VERSION_KEY, installed.version);
                    return;
                }
                if (lastSeen === installed.version) return;

                const info = await fetchReleaseNotes(installed.version);
                if (cancelled) return;
                if (!info || info.notes.length === 0) return; // retry next launch

                setVersion(installed.version);
                setRelease(info);
                setVisible(true);
            } catch (e) {
                console.warn('UpdateLog check failed:', e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!visible) return;
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
        return acquireTabSwipeLock();
    }, [visible, scaleAnim, opacityAnim, slideAnim]);

    const handleClose = useCallback(() => {
        Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 0.94, duration: 200, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 20, duration: 200, useNativeDriver: true }),
        ]).start(async () => {
            setVisible(false);
            try {
                await AsyncStorage.setItem(VERSION_KEY, version);
            } catch { /* non-critical */ }
        });
    }, [scaleAnim, opacityAnim, slideAnim, version]);

    if (!release) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
                <Animated.View
                    style={[
                        styles.container,
                        { maxHeight: height * 0.82, opacity: opacityAnim, transform: [{ scale: scaleAnim }, { translateY: slideAnim }] },
                    ]}
                >
                    <View style={styles.header}>
                        <View style={styles.headerIconWrap}>
                            <SparkleIcon size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.headerLabel}>WHAT'S NEW</Text>
                            <Text style={styles.headerTitle}>Version {version}</Text>
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

                    <ScrollView
                        style={styles.changesList}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.changesContent}
                        bounces={false}
                    >
                        <ReleaseNotesView notes={release.notes} />
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}
                            activeOpacity={0.7}
                        >
                            <StarIcon size={14} color="#FFD700" />
                            <Text style={styles.secondaryBtnText}>Star</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleClose} style={styles.primaryBtn} activeOpacity={0.85}>
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        overflow: 'hidden',
        ...Shadows.xl,
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
    headerText: { flex: 1 },
    headerLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 1.6,
        marginBottom: 2,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.innerBorder },
    changesList: { flexGrow: 0, flexShrink: 1 },
    changesContent: { paddingHorizontal: 20, paddingVertical: 16 },
    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.innerBorder,
    },
    secondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 13,
        paddingHorizontal: 20,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    secondaryBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
    primaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 14,
        backgroundColor: Colors.primary,
    },
    primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
