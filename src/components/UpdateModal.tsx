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
                    {/* Background decoration */}
                    <View style={styles.decorationCircle} />

                    <View style={styles.contentContainer}>
                        {/* Header Section */}
                        <View style={styles.header}>
                            <View style={styles.iconBadge}>
                                <SparkleIcon size={32} color="#FFF" />
                            </View>
                            <View style={styles.headerTextContainer}>
                                <Text style={styles.updateAvailableText}>Update Available</Text>
                                <Text style={styles.versionText}>Version {version} is ready!</Text>
                            </View>
                        </View>

                        {/* Features List */}
                        <View style={styles.divider} />

                        <View style={styles.featuresSection}>
                            <Text style={styles.featuresTitle}>WHAT'S NEW</Text>
                            <ScrollView style={styles.featuresList} showsVerticalScrollIndicator={false}>
                                {features.length > 0 ? features.map((feature, index) => (
                                    <View key={index} style={styles.featureItem}>
                                        <View style={styles.featureIcon}>
                                            <ChevronRightIcon size={14} color={Colors.primary} />
                                        </View>
                                        <Text style={styles.featureText}>{feature}</Text>
                                    </View>
                                )) : (
                                    <Text style={styles.noFeaturesText}>
                                        Bug fixes and performance improvements.
                                    </Text>
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
                                <View style={styles.updateIconBg}>
                                    <DownloadIcon size={20} color={Colors.primary} />
                                </View>
                                <Text style={styles.updateButtonText}>Update Now</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.laterButton}
                                onPress={onClose}
                                activeOpacity={0.6}
                            >
                                <Text style={styles.laterButtonText}>Maybe later</Text>
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
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: Colors.surface, // Use a solid dark color or Colors.surfaceElevated
        borderRadius: BorderRadius.xxl,
        overflow: 'hidden',
        ...Shadows.xl,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    decorationCircle: {
        position: 'absolute',
        top: -100,
        right: -50,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: `${Colors.primary}10`, // Subtle glow
        zIndex: 0,
    },
    contentContainer: {
        zIndex: 1,
        padding: Spacing.xl,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    iconBadge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        ...Shadows.glow(Colors.primary),
    },
    headerTextContainer: {
        alignItems: 'center',
    },
    updateAvailableText: {
        fontSize: Typography.sizes.lg,
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    versionText: {
        fontSize: Typography.sizes.base,
        color: Colors.primary,
        fontWeight: Typography.weights.semibold,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        width: '100%',
        marginBottom: Spacing.lg,
    },
    featuresSection: {
        marginBottom: Spacing.xl,
        maxHeight: 200,
    },
    featuresTitle: {
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
        color: Colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: Spacing.md,
    },
    featuresList: {
        maxHeight: 150,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    featureIcon: {
        marginTop: 3,
        marginRight: Spacing.sm,
    },
    featureText: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    noFeaturesText: {
        color: Colors.textMuted,
        fontStyle: 'italic',
        fontSize: Typography.sizes.sm,
    },
    actions: {
        gap: Spacing.md,
    },
    updateButton: {
        backgroundColor: Colors.textPrimary, // High contrast (White button on dark theme)
        borderRadius: BorderRadius.xl,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
    updateIconBg: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.sm,
    },
    updateButtonText: {
        color: Colors.background, // Dark text on light button
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    },
    laterButton: {
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    laterButtonText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.medium,
    },
});

export default UpdateModal;
