import React, { useRef, useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, BorderRadius, Spacing, Typography } from '../theme';
import { CloseIcon, StarIcon } from './Icons';
import { CookieManagerService } from '../services/CookieManagerService';

interface LoginWebViewModalProps {
    visible: boolean;
    platform: 'instagram' | 'facebook';
    onClose: () => void;
    onSuccess: () => void;
}

export const LoginWebViewModal: React.FC<LoginWebViewModalProps> = ({
    visible,
    platform,
    onClose,
    onSuccess,
}) => {
    const webViewRef = useRef<WebView>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState('Loading...');

    const urlMap: Record<string, string> = {
        instagram: 'https://www.instagram.com/accounts/login/',
        facebook: 'https://www.facebook.com/login/',
        youtube: 'https://accounts.google.com/ServiceLogin?service=youtube',
        tiktok: 'https://www.tiktok.com/login',
        twitter: 'https://twitter.com/i/flow/login',
        twitch: 'https://www.twitch.com/login',
        rumble: 'https://rumble.com/login.php',
    };

    const targetUrl = urlMap[platform];

    // Listen for navigation state changes
    const handleNavigationStateChange = async (navState: any) => {
        setTitle(navState.title || platform.toUpperCase() + ' Login');
        
        // When successfully logged in, usually the url strips 'login' or 'signin'
        const currentUrl = navState.url.toLowerCase();
        if (currentUrl && !currentUrl.includes('login') && !currentUrl.includes('signin') && !currentUrl.includes('oauth')) {
            // It might be logged in, but just to be safe we'll also rely on the manual button below.
        }
    };

    const handleManualSave = async () => {
        setIsLoading(true);
        const success = await CookieManagerService.extractAndSaveCookies(platform, targetUrl);
        setIsLoading(false);
        if (success || ['youtube', 'tiktok', 'twitter', 'twitch', 'rumble'].includes(platform)) {
            onSuccess();
            onClose();
        } else {
            Alert.alert('Session Not Found', 'Could not detect an active session. Please make sure you are fully logged in and seeing your feed.');
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.titleContainer}>
                            <StarIcon size={18} color={Colors.primary} />
                            <Text style={styles.titleText}>{title}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <CloseIcon size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Progress indicator */}
                    {isLoading && (
                        <View style={styles.loaderContainer}>
                            <ActivityIndicator color={Colors.primary} size="large" />
                        </View>
                    )}

                    <WebView
                        ref={webViewRef}
                        source={{ uri: targetUrl }}
                        style={styles.webview}
                        userAgent="Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.58 Mobile Safari/537.36"
                        onLoadStart={() => setIsLoading(true)}
                        onLoadEnd={() => setIsLoading(false)}
                        onNavigationStateChange={handleNavigationStateChange}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        incognito={false}
                    />

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            2FA is fully supported. Once you are successfully logged in and see your feed, click the button below.
                        </Text>
                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.primary }]} onPress={handleManualSave}>
                            <StarIcon size={16} color="#FFF" />
                            <Text style={styles.saveBtnText}>Save & Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: Colors.background,
        height: '90%',
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.innerBorder,
        backgroundColor: Colors.surfaceMedium,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    titleText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    },
    closeButton: {
        padding: Spacing.xs,
        backgroundColor: Colors.surfaceElevated,
        borderRadius: BorderRadius.round,
    },
    webview: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loaderContainer: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
        zIndex: 10,
    },
    footer: {
        padding: Spacing.md,
        backgroundColor: Colors.surfaceMedium,
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorder,
        gap: Spacing.md,
    },
    footerText: {
        color: Colors.textMuted,
        fontSize: Typography.sizes.xs,
        textAlign: 'center',
        fontWeight: Typography.weights.medium,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    }
});
