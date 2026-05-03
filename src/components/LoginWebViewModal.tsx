import React, { useRef, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ToastAndroid,
    Platform,
    Animated,
    Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { CloseIcon, CheckIcon, GlobeIcon } from './Icons';
import { CookieManagerService } from '../services/CookieManagerService';

const { height: SCREEN_H } = Dimensions.get('window');

interface LoginWebViewModalProps {
    visible: boolean;
    platform: 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'twitter' | 'twitch';
    onClose: () => void;
    onSuccess: () => void;
}

// Platform brand colours & labels
const PLATFORM_META: Record<string, { color: string; label: string; emoji: string }> = {
    instagram: { color: '#E1306C', label: 'Instagram', emoji: '📸' },
    facebook:  { color: '#1877F2', label: 'Facebook',  emoji: '💬' },
    youtube:   { color: '#FF0000', label: 'YouTube',   emoji: '▶️' },
    tiktok:    { color: '#00F2EA', label: 'TikTok',    emoji: '🎵' },
    twitter:   { color: '#1DA1F2', label: 'X / Twitter', emoji: '🐦' },
    twitch:    { color: '#9146FF', label: 'Twitch',    emoji: '🎮' },
};

const COOKIE_SYNC_JS = `
(function() {
    try {
        var img = new Image();
        img.src = window.location.origin + '/favicon.ico?' + Date.now();
    } catch(e) {}
    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAGE_READY',
            url: window.location.href,
            hasCookies: document.cookie.length > 0,
            cookieCount: document.cookie ? document.cookie.split(';').length : 0
        }));
    }
    true;
})();
`;

const URL_MAP: Record<string, string> = {
    instagram: 'https://www.instagram.com/accounts/login/',
    facebook:  'https://www.facebook.com/login/',
    youtube:   'https://accounts.google.com/ServiceLogin?service=youtube',
    tiktok:    'https://www.tiktok.com/login',
    twitter:   'https://twitter.com/i/flow/login',
    twitch:    'https://www.twitch.tv/login',
};

const DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const LoginWebViewModal: React.FC<LoginWebViewModalProps> = ({
    visible,
    platform,
    onClose,
    onSuccess,
}) => {
    const webViewRef = useRef<WebView>(null);
    const [isLoading, setIsLoading]   = useState(true);
    const [isSaving,  setIsSaving]    = useState(false);
    const [pageTitle, setPageTitle]   = useState('');
    const [currentUrl, setCurrentUrl] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const saveAnim = useRef(new Animated.Value(1)).current;

    const meta       = PLATFORM_META[platform] ?? { color: Colors.primary, label: platform, emoji: '🌐' };
    const targetUrl  = URL_MAP[platform] ?? `https://www.${platform}.com`;

    const handleNavigationStateChange = useCallback((navState: any) => {
        if (navState.title) setPageTitle(navState.title);
        if (navState.url)   setCurrentUrl(navState.url);

        // Auto-detect login success heuristic: no longer on a login/auth path
        const u = navState.url?.toLowerCase() ?? '';
        const notLoginPage = !u.includes('login') && !u.includes('accounts') &&
                             !u.includes('signin') && !u.includes('auth');
        const onPlatformDomain = u.includes(platform) || u.includes('google.com');
        if (notLoginPage && onPlatformDomain && navState.title && navState.title.length > 2) {
            setIsLoggedIn(true);
        }
    }, [platform]);

    const handleMessage = useCallback((event: any) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'PAGE_READY' && msg.cookieCount > 2) {
                setIsLoggedIn(true);
            }
        } catch (_) {}
    }, []);

    const animateBtn = () => {
        Animated.sequence([
            Animated.timing(saveAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
            Animated.timing(saveAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
        ]).start();
    };

    const handleManualSave = useCallback(async () => {
        animateBtn();
        setIsSaving(true);

        const extractUrl = currentUrl?.startsWith('http') ? currentUrl : targetUrl;

        try {
            webViewRef.current?.injectJavaScript(COOKIE_SYNC_JS);
            await new Promise<void>(r => setTimeout(r, 400));
        } catch (_) {}

        await CookieManagerService.extractAndSaveCookies(platform, extractUrl);
        setIsSaving(false);

        if (Platform.OS === 'android') {
            ToastAndroid.show(`✅ ${meta.label} session saved!`, ToastAndroid.SHORT);
        }
        onSuccess();
        onClose();
    }, [currentUrl, targetUrl, platform, onSuccess, onClose]);

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
            <View style={styles.overlay}>
                {/* Backdrop tap to close */}
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

                <View style={styles.sheet}>
                    {/* ── Pull Handle ── */}
                    <View style={styles.handle} />

                    {/* ── Header ── */}
                    <View style={styles.header}>
                        {/* Platform badge pill */}
                        <View style={[styles.platformPill, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}40` }]}>
                            <Text style={styles.pillEmoji}>{meta.emoji}</Text>
                            <Text style={[styles.pillLabel, { color: meta.color }]}>{meta.label}</Text>
                        </View>

                        <View style={styles.headerCenter}>
                            <Text style={styles.headerTitle}>Secure Login</Text>
                            <Text style={styles.headerSub} numberOfLines={1}>
                                {isLoading ? 'Connecting…' : pageTitle || 'Sign in to continue'}
                            </Text>
                        </View>

                        {/* Login status + close */}
                        <View style={styles.headerRight}>
                            {isLoggedIn && (
                                <View style={styles.loggedBadge}>
                                    <CheckIcon size={10} color="#00E676" />
                                </View>
                            )}
                            <TouchableOpacity
                                onPress={onClose}
                                style={styles.closeBtn}
                                disabled={isSaving}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <CloseIcon size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── URL pill ── */}
                    {!isLoading && currentUrl ? (
                        <View style={styles.urlBar}>
                            <GlobeIcon size={12} color={Colors.textMuted} />
                            <Text style={styles.urlText} numberOfLines={1}>
                                {currentUrl.replace(/^https?:\/\//, '').split('/')[0]}
                            </Text>
                            <View style={[styles.secureDot, { backgroundColor: currentUrl.startsWith('https') ? '#00E676' : Colors.warning }]} />
                        </View>
                    ) : null}

                    {/* ── Thin progress line ── */}
                    {isLoading && (
                        <View style={[styles.loadingBar, { backgroundColor: meta.color }]} />
                    )}

                    {/* ── WebView ── */}
                    <View style={styles.webviewContainer}>
                        <WebView
                            ref={webViewRef}
                            source={{ uri: targetUrl }}
                            style={styles.webview}
                            userAgent={DESKTOP_UA}
                            onLoadStart={() => { setIsLoading(true); setIsLoggedIn(false); }}
                            onLoadEnd={() => setIsLoading(false)}
                            onNavigationStateChange={handleNavigationStateChange}
                            onMessage={handleMessage}
                            injectedJavaScript={COOKIE_SYNC_JS}
                            sharedCookiesEnabled={true}
                            thirdPartyCookiesEnabled={true}
                            incognito={false}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                        />

                        {/* Saving overlay */}
                        {isSaving && (
                            <View style={styles.savingOverlay}>
                                <ActivityIndicator color={meta.color} size="large" />
                                <Text style={styles.savingText}>Saving session…</Text>
                            </View>
                        )}
                    </View>

                    {/* ── Footer ── */}
                    <View style={styles.footer}>
                        <Text style={styles.footerHint}>
                            Log in above, then tap <Text style={{ color: meta.color, fontWeight: '700' }}>Save Session</Text> when you see your feed.
                        </Text>

                        <Animated.View style={{ transform: [{ scale: saveAnim }] }}>
                            <TouchableOpacity
                                style={[
                                    styles.saveBtn,
                                    { backgroundColor: isLoggedIn ? meta.color : Colors.surfaceHigh },
                                    isSaving && styles.saveBtnDisabled,
                                ]}
                                onPress={handleManualSave}
                                disabled={isSaving || isLoading}
                                activeOpacity={0.85}
                            >
                                {isSaving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <CheckIcon size={18} color={isLoggedIn ? '#FFF' : Colors.textMuted} />
                                )}
                                <Text style={[
                                    styles.saveBtnText,
                                    { color: isLoggedIn ? '#FFF' : Colors.textMuted }
                                ]}>
                                    {isSaving ? 'Saving…' : 'Save Session'}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Security note */}
                        <Text style={styles.secNote}>
                            🔒 Cookies are stored locally on your device only.
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
        height: SCREEN_H * 0.91,
        backgroundColor: Colors.surfaceLow,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: Colors.innerBorder,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginTop: 12,
        marginBottom: 8,
    },
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.innerBorder,
        backgroundColor: Colors.surfaceMedium,
    },
    platformPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        gap: 5,
    },
    pillEmoji: { fontSize: 13 },
    pillLabel: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    headerCenter: { flex: 1 },
    headerTitle: {
        color: Colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    headerSub: {
        color: Colors.textMuted,
        fontSize: 11,
        marginTop: 1,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loggedBadge: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,230,118,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,230,118,0.3)',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // ── URL bar ──
    urlBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: Colors.surfaceMedium,
        borderBottomWidth: 1,
        borderBottomColor: Colors.innerBorder,
    },
    urlText: {
        flex: 1,
        color: Colors.textMuted,
        fontSize: 11,
    },
    secureDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    loadingBar: {
        height: 2,
        opacity: 0.7,
    },
    // ── WebView ──
    webviewContainer: {
        flex: 1,
        position: 'relative',
    },
    webview: {
        flex: 1,
        backgroundColor: '#fff',
    },
    savingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(1,1,1,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 14,
        zIndex: 10,
    },
    savingText: {
        color: Colors.textSecondary,
        fontSize: 15,
        fontWeight: '600',
    },
    // ── Footer ──
    footer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 20,
        gap: 10,
        backgroundColor: Colors.surfaceMedium,
        borderTopWidth: 1,
        borderTopColor: Colors.innerBorder,
    },
    footerHint: {
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 18,
        gap: 8,
        borderWidth: 1,
        borderColor: Colors.innerBorderLight,
        ...Shadows.md,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    secNote: {
        color: Colors.textMuted,
        fontSize: 10,
        textAlign: 'center',
        opacity: 0.7,
    },
});
