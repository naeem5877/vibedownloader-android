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
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon, CloseIcon } from './Icons';

const { width } = Dimensions.get('window');

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
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 10,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.8);
            opacityAnim.setValue(0);
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
        >
            <View style={styles.overlay}>
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    {/* Close Button */}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                        activeOpacity={0.7}
                    >
                        <CloseIcon size={20} color={Colors.textMuted} />
                    </TouchableOpacity>

                    {/* Icon */}
                    <View style={styles.iconContainer}>
                        <SparkleIcon size={36} color={Colors.primary} />
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>Update Available</Text>
                    <View style={styles.versionBadge}>
                        <Text style={styles.versionText}>v{version}</Text>
                    </View>

                    {/* Features */}
                    {features.length > 0 && (
                        <View style={styles.featuresContainer}>
                            <Text style={styles.featuresTitle}>What's New</Text>
                            {features.slice(0, 4).map((feature, index) => (
                                <View key={index} style={styles.featureItem}>
                                    <View style={styles.featureBullet} />
                                    <Text style={styles.featureText}>{feature}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Buttons */}
                    <View style={styles.buttonsContainer}>
                        <TouchableOpacity
                            style={styles.laterButton}
                            onPress={onClose}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.laterButtonText}>Later</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.updateButton}
                            onPress={handleUpdate}
                            activeOpacity={0.8}
                        >
                            <DownloadIcon size={18} color="#FFF" />
                            <Text style={styles.updateButtonText}>Update Now</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: Colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    modalContainer: {
        width: width - Spacing.xl * 2,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.xxl,
        padding: Spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.xl,
    },
    closeButton: {
        position: 'absolute',
        top: Spacing.md,
        right: Spacing.md,
        width: 36,
        height: 36,
        borderRadius: BorderRadius.round,
        backgroundColor: Colors.surfaceHover,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 22,
        backgroundColor: `${Colors.primary}20`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        ...Shadows.glow(Colors.primary),
    },
    title: {
        fontSize: Typography.sizes['2xl'],
        fontWeight: Typography.weights.bold,
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    versionBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.round,
        marginBottom: Spacing.lg,
    },
    versionText: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: '#FFF',
    },
    featuresContainer: {
        width: '100%',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
    },
    featuresTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
        color: Colors.textMuted,
        marginBottom: Spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: Spacing.xs,
    },
    featureBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.primary,
        marginTop: 6,
        marginRight: Spacing.sm,
    },
    featureText: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    buttonsContainer: {
        flexDirection: 'row',
        gap: Spacing.sm,
        width: '100%',
    },
    laterButton: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surfaceHover,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    laterButtonText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.semibold,
        color: Colors.textSecondary,
    },
    updateButton: {
        flex: 2,
        flexDirection: 'row',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        ...Shadows.glow(Colors.primary),
    },
    updateButtonText: {
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        color: '#FFF',
    },
});

export default UpdateModal;
