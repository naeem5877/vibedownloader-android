import React, { useRef, useEffect } from 'react';
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
    Alert,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SettingsIcon, StarIcon, ShareIcon, TrashIcon, CloseIcon } from './Icons';
import { YtDlpNative } from '../native/YtDlpModule';

const { width } = Dimensions.get('window');

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    appVersion?: string;
    ytdlpVersion?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    visible,
    onClose,
}) => {
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    const [appVer, setAppVer] = React.useState("Loading...");
    const [ytVer, setYtVer] = React.useState("Loading...");

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 120,
                    friction: 14,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();

            // Fetch dynamic versions
            YtDlpNative.getVersions()
                .then(res => {
                    setAppVer(res.appVersion);
                    setYtVer(res.ytdlpVersion);
                })
                .catch(err => {
                    console.warn("Failed to fetch versions natively:", err);
                    setAppVer(require('../../package.json').version || "1.2.1");
                    setYtVer("Unknown");
                });
        } else {
            scaleAnim.setValue(0.9);
            opacityAnim.setValue(0);
            translateY.setValue(20);
        }
    }, [visible]);

    if (!visible) return null;

    const handleClearCache = () => {
        Alert.alert("Clear Cache", "Cache cleared successfully!");
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            opacity: opacityAnim,
                            transform: [
                                { scale: scaleAnim },
                                { translateY: translateY }
                            ],
                        },
                    ]}
                >
                    <View style={styles.bgPulse} />
                    <View style={styles.scanline} />

                    <View style={styles.contentContainer}>
                        {/* Header Section */}
                        <View style={styles.header}>
                            <View style={styles.headerIconContainer}>
                                <View style={styles.headerIconGlow} />
                                <SettingsIcon size={32} color={Colors.primary} />
                            </View>
                            <View style={styles.headerTextContainer}>
                                <Text style={styles.technicalLabel}>SYSTEM CONTROL</Text>
                                <Text style={styles.versionTitle}>Settings</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <CloseIcon size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.technicalLine}>
                            <View style={styles.lineDot} />
                            <View style={styles.lineMain} />
                            <View style={styles.lineDot} />
                        </View>

                        {/* Settings Options */}
                        <View style={styles.optionsSection}>
                            <View style={styles.optionRow}>
                                <Text style={styles.optionLabel}>App Version</Text>
                                <Text style={styles.optionValue}>v{appVer}</Text>
                            </View>
                            <View style={styles.optionRow}>
                                <Text style={styles.optionLabel}>yt-dlp Version</Text>
                                <Text style={styles.optionValue}>{ytVer}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => Linking.openURL('https://github.com/naeem5877/vibedownloader-android')}
                            >
                                <StarIcon size={18} color="#FFD700" />
                                <Text style={styles.actionBtnText}>Star GitHub Repository</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => Share.share({ message: 'Check out VibeDownloader - The ultimate media downloader for Android! https://github.com/naeem5877/vibedownloader-android' })}
                            >
                                <ShareIcon size={18} color={Colors.textPrimary} />
                                <Text style={styles.actionBtnText}>Share Application</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={[styles.actionBtn, { borderColor: 'rgba(255, 87, 34, 0.2)' }]}
                                onPress={handleClearCache}
                            >
                                <TrashIcon size={18} color={Colors.error} />
                                <Text style={[styles.actionBtnText, { color: Colors.error }]}>Clear Temporary Cache</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
        overflow: 'hidden',
    },
    bgPulse: {
        position: 'absolute',
        width: width,
        height: width,
        borderRadius: width / 2,
        backgroundColor: Colors.primary,
        opacity: 0.05,
        top: -width / 2,
        right: -width / 4,
    },
    scanline: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        zIndex: 2,
    },
    contentContainer: {
        padding: 24,
        zIndex: 3,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        position: 'relative',
    },
    closeBtn: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 8,
    },
    headerIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: `${Colors.primary}12`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        position: 'relative',
        borderWidth: 1,
        borderColor: `${Colors.primary}20`,
    },
    headerIconGlow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 18,
        backgroundColor: Colors.primary,
        opacity: 0.1,
    },
    headerTextContainer: {
        alignItems: 'center',
    },
    technicalLabel: {
        fontSize: 10,
        fontWeight: Typography.weights.black,
        color: Colors.primary,
        letterSpacing: 2,
        marginBottom: 4,
    },
    versionTitle: {
        fontSize: 22,
        fontWeight: Typography.weights.black,
        color: Colors.textPrimary,
        letterSpacing: Typography.letterSpacing.tight,
    },
    technicalLine: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        gap: 8,
    },
    lineDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    lineMain: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    optionsSection: {
        gap: 12,
    },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.03)',
    },
    optionLabel: {
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: Typography.weights.medium,
    },
    optionValue: {
        fontSize: 14,
        color: Colors.textPrimary,
        fontWeight: Typography.weights.bold,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 12,
    },
    actionBtnText: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: Typography.weights.bold,
    },
});

export default SettingsModal;
