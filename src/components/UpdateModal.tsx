/**
 * Premium Update Modal - Custom styled update notification
 */
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
    ScrollView,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon, CloseIcon, ChevronRightIcon } from './Icons';

const { width, height } = Dimensions.get('window');

interface UpdateModalProps {
    visible: boolean;
    onClose: () => void;
    version: string;
    releaseUrl: string;
    downloadUrl?: string;
    features?: string[];
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
    visible,
    onClose,
    version,
    releaseUrl,
    downloadUrl,
    features = [],
}) => {
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

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
        } else {
            scaleAnim.setValue(0.9);
            opacityAnim.setValue(0);
            translateY.setValue(20);
        }
    }, [visible]);

    const handleUpdate = () => {
        const url = downloadUrl || releaseUrl;
        Linking.openURL(url);
        onClose();
    };

    if (!visible) return null;

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
                    {/* Atmospheric Background Layers */}
                    <View style={styles.bgPulse} />
                    <View style={styles.scanline} />

                    <View style={styles.contentContainer}>
                        {/* Header Section */}
                        <View style={styles.header}>
                            <View style={styles.headerIconContainer}>
                                <View style={styles.headerIconGlow} />
                                <SparkleIcon size={32} color={Colors.primary} />
                            </View>
                            <View style={styles.headerTextContainer}>
                                <Text style={styles.technicalLabel}>CORE SYSTEM UPDATE</Text>
                                <Text style={styles.versionTitle}>Build v{version} Ready</Text>
                            </View>
                        </View>

                        {/* Technical Separator */}
                        <View style={styles.technicalLine}>
                            <View style={styles.lineDot} />
                            <View style={styles.lineMain} />
                            <View style={styles.lineDot} />
                        </View>

                        {/* Features List */}
                        <View style={styles.featuresSection}>
                            <Text style={styles.featuresTitle}>PATCH NOTES & LOGS</Text>
                            <ScrollView
                                style={styles.featuresList}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.featuresContent}
                            >
                                {features.length > 0 ? features.map((feature, index) => (
                                    <View key={index} style={styles.featureItem}>
                                        <View style={styles.featureBullet}>
                                            <View style={styles.bulletCore} />
                                        </View>
                                        <Text style={styles.featureText}>{feature}</Text>
                                    </View>
                                )) : (
                                    <View style={styles.featureItem}>
                                        <View style={styles.featureBullet}>
                                            <View style={styles.bulletCore} />
                                        </View>
                                        <Text style={styles.featureText}>Stable system build optimization.</Text>
                                    </View>
                                )}
                            </ScrollView>
                        </View>

                        {/* Actions */}
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={styles.updateButton}
                                onPress={handleUpdate}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.updateButtonText}>INITIALIZE PATCH</Text>
                                <DownloadIcon size={18} color={Colors.textPrimary} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.laterButton}
                                onPress={onClose}
                                activeOpacity={0.6}
                            >
                                <Text style={styles.laterButtonText}>DEFER INSTALLATION</Text>
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
    featuresSection: {
        marginBottom: 32,
    },
    featuresTitle: {
        fontSize: 9,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 16,
    },
    featuresList: {
        maxHeight: 180,
    },
    featuresContent: {
        paddingRight: 4,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.03)',
    },
    featureBullet: {
        width: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        marginTop: 2,
    },
    bulletCore: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
    },
    featureText: {
        flex: 1,
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
        fontWeight: Typography.weights.medium,
    },
    actions: {
        gap: 12,
    },
    updateButton: {
        backgroundColor: Colors.primary,
        borderRadius: 16,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    updateButtonText: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: Typography.weights.black,
        letterSpacing: 1,
    },
    laterButton: {
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    laterButtonText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: Typography.weights.bold,
        letterSpacing: 1,
    },
});

export default UpdateModal;
