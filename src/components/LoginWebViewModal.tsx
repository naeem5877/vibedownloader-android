import React, { useRef, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ToastAndroid,
    Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, BorderRadius, Spacing, Typography } from '../theme';
import { CloseIcon, StarIcon } from './Icons';
import { CookieManagerService } from '../services/CookieManagerService';

interface LoginWebViewModalProps {
    visible: boolean;
    platform: 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'twitter' | 'twitch' | 'rumble';
    onClose: () => void;
    onSuccess: () => void;
}

// ─── Injected JavaScript ────────────────────────────────────────────────────
// This script runs on every page load inside the WebView.
// Its only purpose is to force Android to sync in-memory cookies to the
// native CookieManager before we try to read them via the native bridge.
// It also posts a readiness signal so we can show a hint to the user.
const COOKIE_SYNC_JS = `
(function() {
    try {
        // Force a no-op fetch that causes the WebKit layer to sync cookies
        var img = new Image();
        img.src = window.location.origin + '/favicon.ico?' + Date.now();
    } catch(e) {}
    // Notify React Native that the page is interactive
    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAGE_READY',
            url: window.location.href,
            hasCookies: document.cookie.length > 0,
            cookieCount: document.cookie ? document.cookie.split(';').length : 0
        }));
    }
    true; // required — must end with truthy value
})();
`;

export const LoginWebViewModal: React.FC<LoginWebViewModalProps> = ({
    visible,
    platform,
    onClose,
    onSuccess,
}) => {
    const webViewRef = useRef<WebView>(null);
    const [isLoading, setIsLoading]     = useState(true);
    const [isSaving, setIsSaving]       = useState(false);
    const [title, setTitle]             = useState('Loading...');
    const [currentUrl, setCurrentUrl]   = useState('');
    const [pageReady, setPageReady]     = useState(false);

    const urlMap: Record<string, string> = {
        instagram: 'https://www.instagram.com/accounts/login/',
        facebook:  'https://www.facebook.com/login/',
        youtube:   'https://accounts.google.com/ServiceLogin?service=youtube',
        tiktok:    'https://www.tiktok.com/login',
        twitter:   'https://twitter.com/i/flow/login',
        twitch:    'https://www.twitch.tv/login',
        rumble:    'https://rumble.com/login.php',
    };

    // Desktop UA is REQUIRED: mobile UA causes Instagram/Facebook to serve
    // stripped pages that don't set the full session cookies yt-dlp needs.
    const DESKTOP_UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    const targetUrl = urlMap[platform] ?? `https://www.${platform}.com`;

    // ── Navigation state tracking ──────────────────────────────────────────
    const handleNavigationStateChange = useCallback((navState: any) => {
        if (navState.title) setTitle(navState.title);
        if (navState.url)   setCurrentUrl(navState.url);
    }, []);

    // ── WebView message handler ────────────────────────────────────────────
    // Receives the PAGE_READY signal from the injected JS above.
    const handleMessage = useCallback((event: any) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'PAGE_READY') {
                setPageReady(true);
                console.log(
                    `[LoginWebViewModal] Page ready: ${msg.url} | ` +
                    `JS-visible cookies: ${msg.cookieCount}`
                );
            }
        } catch (_) {
            // non-JSON message from the page itself — ignore
        }
    }, []);

    // ── "Save & Continue" handler ──────────────────────────────────────────
    const handleManualSave = useCallback(async () => {
        setIsSaving(true);

        // Use the URL where the WebView currently is (post-login feed page),
        // NOT just the original login URL. Session cookies live on the domain
        // root (e.g. https://www.instagram.com), not on /accounts/login/.
        const extractUrl =
            currentUrl && currentUrl.startsWith('http') ? currentUrl : targetUrl;

        console.log(
            `[LoginWebViewModal] Extracting cookies for ${platform} from: ${extractUrl}`
        );

        // Inject the sync script one final time right before reading,
        // to flush any last in-flight cookie writes.
        try {
            webViewRef.current?.injectJavaScript(COOKIE_SYNC_JS);
            // Small delay to allow the flush to propagate
            await new Promise<void>(r => setTimeout(r, 400));
        } catch (_) {}

        await CookieManagerService.extractAndSaveCookies(platform, extractUrl);
        setIsSaving(false);

        if (Platform.OS === 'android') {
            ToastAndroid.show('✅ Cookies saved and applied!', ToastAndroid.SHORT);
        }
        onSuccess();
        onClose();
    }, [currentUrl, targetUrl, platform, onSuccess, onClose]);

    if (!visible) return null;

    const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* ── Header ── */}
                    <View style={styles.header}>
                        <View style={styles.titleContainer}>
                            <StarIcon size={18} color={Colors.primary} />
                            <Text style={styles.titleText} numberOfLines={1}>
                                {title}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            disabled={isSaving}
                        >
                            <CloseIcon size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Loading overlay ── */}
                    {(isLoading || isSaving) && (
                        <View style={styles.loaderContainer}>
                            <ActivityIndicator color={Colors.primary} size="large" />
                            {isSaving && (
                                <Text style={styles.savingText}>
                                    Saving cookies…
                                </Text>
                            )}
                        </View>
                    )}

                    {/* ── WebView ── */}
                    <WebView
                        ref={webViewRef}
                        source={{ uri: targetUrl }}
                        style={styles.webview}
                        userAgent={DESKTOP_UA}
                        onLoadStart={() => { setIsLoading(true);  setPageReady(false); }}
                        onLoadEnd={()   => { setIsLoading(false); }}
                        onNavigationStateChange={handleNavigationStateChange}
                        onMessage={handleMessage}
                        injectedJavaScript={COOKIE_SYNC_JS}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        incognito={false}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                    />

                    {/* ── Footer ── */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            Log in to {platformLabel} above (2FA is supported). Once you can see
                            your feed / home page, tap the button below.
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                { backgroundColor: Colors.primary },
                                isSaving && styles.saveBtnDisabled,
                            ]}
                            onPress={handleManualSave}
                            disabled={isSaving || isLoading}
                        >
                            {isSaving
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <StarIcon size={16} color="#FFF" />
                            }
                            <Text style={styles.saveBtnText}>
                                {isSaving ? 'Saving…' : 'Save & Continue'}
                            </Text>
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
        flex: 1,
        marginRight: Spacing.sm,
    },
    titleText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
        flexShrink: 1,
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
        gap: 12,
    },
    savingText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        marginTop: 8,
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
    saveBtnDisabled: {
        opacity: 0.6,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: Typography.sizes.base,
        fontWeight: Typography.weights.bold,
    },
});
