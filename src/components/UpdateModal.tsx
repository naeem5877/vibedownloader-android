/**
 * Update Modal - Shown when a newer version is available on GitHub
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
import { Colors, Typography, Shadows } from '../theme';
import { SparkleIcon, DownloadIcon } from './Icons';

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
    const scaleAnim = useRef(new Animated.Value(0.92)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 90,
                    friction: 13,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 260,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 280,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.92);
            opacityAnim.setValue(0);
            translateY.setValue(24);
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
                            transform: [{ scale: scaleAnim }, { translateY }],
                        },
                    ]}
                >
                    <View style={styles.bgGlow} />

                    <View style={styles.content}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.iconWrap}>
                                <SparkleIcon size={28} color={Colors.primary} />
                            </View>
                            <Text style={styles.label}>UPDATE AVAILABLE</Text>
                            <Text style={styles.title}>Version {version}</Text>
                            <Text style={styles.subtitle}>
                                A newer build is ready to download
                            </Text>
                        </View>

                        {/* Features */}
                        <View style={styles.featuresBlock}>
                            <Text style={styles.featuresHeading}>What's included</Text>
                            <ScrollView
                                style={styles.featuresScroll}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.featuresInner}
                                bounces={false}
                            >
                                {features.length > 0 ? (
                                    features.map((feature, index) => (
                                        <View key={index} style={styles.featureRow}>
                                            <View style={styles.bullet} />
                                            <Text style={styles.featureText}>{feature}</Text>
                                        </View>
                                    ))
                                ) : (
                                    <View style={styles.featureRow}>
                                        <View style={styles.bullet} />
                                        <Text style={styles.featureText}>
                                            Performance and stability improvements
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                        </View>

                        {/* Actions */}
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={styles.primaryBtn}
                                onPress={handleUpdate}
                                activeOpacity={0.85}
                            >
                                <DownloadIcon size={18} color="#FFF" />
                                <Text style={styles.primaryBtnText}>Download update</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.secondaryBtn}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.secondaryBtnText}>Not now</Text>
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
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 22,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: Colors.surfaceHigh,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        overflow: 'hidden',
        ...Shadows.xl,
    },
    bgGlow: {
        position: 'absolute',
        width: width * 0.7,
        height: width * 0.7,
        borderRadius: width * 0.35,
        backgroundColor: Colors.primary,
        opacity: 0.06,
        top: -width * 0.25,
        alignSelf: 'center',
        left: '15%',
    },
    content: {
        padding: 22,
        zIndex: 2,
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
    },
    iconWrap: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: `${Colors.primary}15`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
        borderWidth: 1,
        borderColor: `${Colors.primary}28`,
    },
    label: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 1.6,
        marginBottom: 4,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.4,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 13,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    featuresBlock: {
        marginBottom: 22,
    },
    featuresHeading: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 0.6,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    featuresScroll: {
        maxHeight: 160,
    },
    featuresInner: {
        gap: 8,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    bullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.primary,
        marginTop: 5,
        marginRight: 10,
        flexShrink: 0,
    },
    featureText: {
        flex: 1,
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
        fontWeight: '500',
    },
    actions: {
        gap: 10,
    },
    primaryBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 14,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...Shadows.glow(Colors.primary),
    },
    primaryBtnText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    secondaryBtn: {
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
    },
    secondaryBtnText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
});

export default UpdateModal;
