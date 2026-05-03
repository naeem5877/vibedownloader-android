import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Animated,
    Dimensions,
    Linking,
    Share,
    ScrollView,
    Switch,
    Alert,
    ToastAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import {
    SettingsIcon, StarIcon, ShareIcon, CloseIcon,
    RefreshIcon, InfoIcon, TrashIcon, DiscordIcon,
    ChevronRightIcon,
} from './Icons';
import { YtDlpNative } from '../native/YtDlpModule';
import { CookieManagerService } from '../services/CookieManagerService';
import { LocalDB } from '../services/LocalDB';
import { Haptics } from '../utils/haptics';

const { height: SCREEN_H } = Dimensions.get('window');

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    appVersion?: string;
}

// ── Section header ──────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
    <Text style={styles.sectionHeader}>{label}</Text>
);

// ── Info row (label + value, no press) ─────────────────────────────────────
const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: string }> = ({
    icon, label, value, accent,
}) => (
    <View style={styles.row}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
);

// ── Action row (tappable) ───────────────────────────────────────────────────
const ActionRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    sublabel?: string;
    onPress: () => void;
    destructive?: boolean;
    rightEl?: React.ReactNode;
}> = ({ icon, label, sublabel, onPress, destructive, rightEl }) => {
    const pressAnim = useRef(new Animated.Value(1)).current;
    const handlePress = () => {
        Animated.sequence([
            Animated.timing(pressAnim, { toValue: 0.97, duration: 70, useNativeDriver: true }),
            Animated.timing(pressAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
        onPress();
    };
    return (
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
            <TouchableOpacity
                style={[styles.row, styles.rowTouchable, destructive && styles.rowDestructive]}
                onPress={handlePress}
                activeOpacity={1}
            >
                <View style={[styles.rowIcon, destructive && { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                    {icon}
                </View>
                <View style={styles.rowTextCol}>
                    <Text style={[styles.rowLabel, destructive && { color: Colors.error }]}>{label}</Text>
                    {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
                </View>
                {rightEl ?? <ChevronRightIcon size={16} color={Colors.textMuted} />}
            </TouchableOpacity>
        </Animated.View>
    );
};

// ── Toggle row ──────────────────────────────────────────────────────────────
const ToggleRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    sublabel?: string;
    value: boolean;
    onToggle: (v: boolean) => void;
}> = ({ icon, label, sublabel, value, onToggle }) => (
    <View style={[styles.row, styles.rowTouchable]}>
        <View style={styles.rowIcon}>{icon}</View>
        <View style={styles.rowTextCol}>
            <Text style={styles.rowLabel}>{label}</Text>
            {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
        </View>
        <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: Colors.surfaceHigh, true: `${Colors.primary}80` }}
            thumbColor={value ? Colors.primary : Colors.textMuted}
            ios_backgroundColor={Colors.surfaceHigh}
        />
    </View>
);

// ── Main component ───────────────────────────────────────────────────────────
export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose }) => {
    const slideAnim   = useRef(new Animated.Value(SCREEN_H)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    const [appVer, setAppVer]         = useState('–');
    const [ytVer, setYtVer]           = useState('–');
    const [updatingYt, setUpdatingYt] = useState(false);
    const [haptics, setHaptics]       = useState(false);
    const [autoClip, setAutoClip]     = useState(true);

    // Load persisted prefs & versions on open
    useEffect(() => {
        if (!visible) {
            slideAnim.setValue(SCREEN_H);
            opacityAnim.setValue(0);
            return;
        }

        Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 80,
                friction: 14,
                useNativeDriver: true,
            }),
        ]).start();

        // Versions
        YtDlpNative.getVersions?.()
            .then(r => { setAppVer(r.appVersion); setYtVer(r.ytdlpVersion); })
            .catch(() => {
                try { setAppVer(require('../../package.json').version); } catch (_) {}
                setYtVer('Unknown');
            });

        // Persisted settings
        Promise.all([
            LocalDB.getSetting('pref_haptics', false),
            LocalDB.getSetting('pref_autoclip', true)
        ]).then(([hapticsVal, autoclipVal]) => {
            setHaptics(hapticsVal);
            setAutoClip(autoclipVal);
        }).catch(() => {});
    }, [visible]);

    const close = () => {
        Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: SCREEN_H * 0.3, duration: 200, useNativeDriver: true }),
        ]).start(onClose);
    };

    const savePref = (key: string, value: boolean) =>
        LocalDB.setSetting(key, value);

    const handleUpdateYtDlp = async () => {
        setUpdatingYt(true);
        try {
            const res = await YtDlpNative.updateYtDlp();
            ToastAndroid.show(`✅ yt-dlp: ${res.status}`, ToastAndroid.LONG);
            // Re-fetch version after update
            YtDlpNative.getVersions?.()
                .then(r => setYtVer(r.ytdlpVersion))
                .catch(() => {});
        } catch (e: any) {
            Alert.alert('Update Failed', e.message || 'Could not update yt-dlp');
        } finally {
            setUpdatingYt(false);
        }
    };

    const handleClearAllSessions = () => {
        Alert.alert(
            'Clear All Sessions',
            'This will log you out of all platforms (Instagram, YouTube, TikTok, etc.) and delete all saved cookie files. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                        const platforms = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'twitch'];
                        for (const p of platforms) {
                            try { await CookieManagerService.clearCookies(p); } catch (_) {}
                        }
                        ToastAndroid.show('🗑️ All sessions cleared', ToastAndroid.SHORT);
                    },
                },
            ]
        );
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={close} statusBarTranslucent>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} activeOpacity={1} />
            </Animated.View>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Pull handle */}
                <View style={styles.handle} />

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerIconWrap}>
                        <SettingsIcon size={20} color={Colors.primary} />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={styles.headerLabel}>PREFERENCES</Text>
                        <Text style={styles.headerTitle}>Settings</Text>
                    </View>
                    <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <CloseIcon size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                    {/* ── Version info ── */}
                    <SectionHeader label="VERSION INFO" />
                    <View style={styles.card}>
                        <InfoRow
                            icon={<InfoIcon size={16} color={Colors.primary} />}
                            label="App Version"
                            value={`v${appVer}`}
                            accent={Colors.primary}
                        />
                        <View style={styles.rowDivider} />
                        <InfoRow
                            icon={<RefreshIcon size={16} color={Colors.textMuted} />}
                            label="yt-dlp Version"
                            value={ytVer}
                        />
                    </View>

                    {/* ── Download preferences ── */}
                    <SectionHeader label="DOWNLOAD" />
                    <View style={styles.card}>
                        <ToggleRow
                            icon={<InfoIcon size={16} color={Colors.textMuted} />}
                            label="Auto-paste from Clipboard"
                            sublabel="Paste clipboard URL when you open the app"
                            value={autoClip}
                            onToggle={v => { setAutoClip(v); savePref('pref_autoclip', v); }}
                        />
                        <View style={styles.rowDivider} />
                        <ActionRow
                            icon={<RefreshIcon size={16} color={Colors.secondary} />}
                            label="Update yt-dlp Engine"
                            sublabel={updatingYt ? 'Updating…' : 'Keep the download engine up to date'}
                            onPress={handleUpdateYtDlp}
                            rightEl={
                                updatingYt
                                    ? <RefreshIcon size={16} color={Colors.primary} />
                                    : undefined
                            }
                        />
                    </View>

                    {/* ── Privacy & Sessions ── */}
                    <SectionHeader label="PRIVACY & SESSIONS" />
                    <View style={styles.card}>
                        <ActionRow
                            icon={<TrashIcon size={16} color={Colors.error} />}
                            label="Clear All Platform Sessions"
                            sublabel="Logs out of Instagram, YouTube, TikTok…"
                            onPress={handleClearAllSessions}
                            destructive
                        />
                    </View>

                    {/* ── General ── */}
                    <SectionHeader label="GENERAL" />
                    <View style={styles.card}>
                        <ToggleRow
                            icon={<StarIcon size={16} color={Colors.accent} />}
                            label="Haptic Feedback"
                            sublabel="Vibration on button interactions"
                            value={haptics}
                            onToggle={v => { setHaptics(v); savePref('pref_haptics', v); Haptics.setEnabled(v); }}
                        />
                    </View>

                    {/* ── Community ── */}
                    <SectionHeader label="COMMUNITY" />
                    <View style={styles.card}>
                        <ActionRow
                            icon={<StarIcon size={16} color="#FFD700" />}
                            label="Star on GitHub"
                            sublabel="Support the project ⭐"
                            onPress={() => Linking.openURL('https://github.com/naeem5877/vibedownloader-android')}
                        />
                        <View style={styles.rowDivider} />
                        <ActionRow
                            icon={<DiscordIcon size={16} color="#5865F2" />}
                            label="Join Discord"
                            sublabel="Get support and share feedback"
                            onPress={() => Linking.openURL('https://discord.gg/vibedownloader')}
                        />
                        <View style={styles.rowDivider} />
                        <ActionRow
                            icon={<ShareIcon size={16} color={Colors.textSecondary} />}
                            label="Share App"
                            sublabel="Tell your friends about VibeDownloader"
                            onPress={() =>
                                Share.share({
                                    message:
                                        'Check out VibeDownloader — Download from Instagram, YouTube, TikTok & more! https://github.com/naeem5877/vibedownloader-android',
                                })
                            }
                        />
                    </View>

                    {/* Bottom spacer */}
                    <View style={{ height: 32 }} />
                </ScrollView>
            </Animated.View>
        </Modal>
    );
};



const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: SCREEN_H * 0.88,
        backgroundColor: Colors.surfaceLow,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: Colors.innerBorder,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginTop: 12,
        marginBottom: 4,
    },
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.innerBorder,
    },
    headerIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 13,
        backgroundColor: `${Colors.primary}18`,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: `${Colors.primary}30`,
    },
    headerText: { flex: 1 },
    headerLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: Colors.primary,
        letterSpacing: 1.5,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.textPrimary,
        letterSpacing: -0.4,
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // ── Scroll ──
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionHeader: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.textMuted,
        letterSpacing: 1.4,
        marginTop: 20,
        marginBottom: 8,
        marginLeft: 4,
    },
    // ── Card container ──
    card: {
        backgroundColor: Colors.surfaceMedium,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        overflow: 'hidden',
    },
    rowDivider: {
        height: 1,
        backgroundColor: Colors.innerBorder,
        marginLeft: 52,
    },
    // ── Row base ──
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 12,
    },
    rowTouchable: {
        // tap feedback handled by Animated
    },
    rowDestructive: {
        // accent handled by icon bg
    },
    rowIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    rowTextCol: { flex: 1 },
    rowLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        letterSpacing: -0.1,
    },
    rowSublabel: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
        fontWeight: '400',
    },
    rowValue: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.textSecondary,
    },
});

export default SettingsModal;
