import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { YtDlpNative } from '../native/YtDlpModule';

export class CookieManagerService {

    private static readonly PLATFORM_DOMAINS: Record<string, string[]> = {
        instagram: [
            'https://www.instagram.com',
            'https://instagram.com',
            'https://i.instagram.com',
            'https://m.instagram.com',
        ],
        facebook: [
            'https://www.facebook.com',
            'https://facebook.com',
            'https://m.facebook.com',
        ],
        youtube: [
            'https://www.youtube.com',
            'https://youtube.com',
            'https://accounts.google.com',
            'https://www.google.com',
        ],
        tiktok: [
            'https://www.tiktok.com',
            'https://tiktok.com',
            'https://m.tiktok.com',
        ],
        twitter: [
            'https://x.com',
            'https://twitter.com',
            'https://www.twitter.com',
        ],
        twitch: [
            'https://www.twitch.tv',
            'https://twitch.tv',
        ],
    };

    private static readonly CRITICAL_COOKIES: Record<string, string[]> = {
        instagram: ['sessionid'],
        facebook: ['c_user', 'xs'],
        youtube: ['SID', 'SSID', 'HSID'],
        tiktok: ['sessionid'],
        twitter: ['auth_token', 'ct0'],
        twitch: ['auth-token'],
    };

    private static readonly DEFAULT_DOMAINS: Record<string, string> = {
        instagram: '.instagram.com',
        facebook: '.facebook.com',
        youtube: '.youtube.com',
        tiktok: '.tiktok.com',
        twitter: '.twitter.com',
        twitch: '.twitch.tv',
    };

    // ─────────────────────────────────────────────
    // PUBLIC: Get cookie file path for yt-dlp
    // ─────────────────────────────────────────────
    static async getCookiesForPlatform(platform: string): Promise<string | null> {
        try {
            const key = platform.toLowerCase();

            const expiryStr = await AsyncStorage.getItem(`cookies_expiry_${key}`);
            if (expiryStr && Date.now() > parseInt(expiryStr, 10)) {
                await CookieManagerService._clearStorageKeys(key);
                return null;
            }

            // DYNAMICALLY get the correct current path from Native to avoid sandbox changes
            const currentPath = await YtDlpNative.getCookiesFilePath(key);
            if (!currentPath) {
                 await CookieManagerService._clearStorageKeys(key);
                 return null;
            }

            return currentPath;
        } catch (error) {
            return null;
        }
    }

    // ─────────────────────────────────────────────
    // PUBLIC: Extract cookies and save Netscape file
    // ─────────────────────────────────────────────
    static async extractAndSaveCookies(
        platform: string,
        currentUrl: string
    ): Promise<boolean> {
        try {
            const key = platform.toLowerCase();
            const predefined = CookieManagerService.PLATFORM_DOMAINS[key] || [];
            const defaultDomain = CookieManagerService.DEFAULT_DOMAINS[key] || `.${key}.com`;

            const urlsToCheck = Array.from(new Set(
                [currentUrl, ...predefined].filter(u => u?.startsWith('http'))
            ));

            // ── Flush Android cookie store ──
            if (Platform.OS === 'android') {
                try { await CookieManager.flush(); } catch (e) { }
                // Give OS time to persist — 2s on slow devices
                await CookieManagerService._sleep(2000);
            }

            // ── STEP 1: Native method (gets HttpOnly session cookies) ──
            // Key fix: BEST VALUE WINS, not first/last wins.
            // We score each cookie: longer non-empty value = more likely real session token.
            const nativeCandidates = new Map<string, { value: string; domain: string; score: number }>();

            for (const url of urlsToCheck) {
                try {
                    const raw = await YtDlpNative.getWebViewCookies(url);
                    if (!raw?.trim()) continue;

                    const urlDomain = CookieManagerService._cleanDomain(url);

                    for (const pair of raw.split(/;\s*/)) {
                        const eqIdx = pair.indexOf('=');
                        if (eqIdx === -1) continue;
                        const name = pair.substring(0, eqIdx).trim();
                        const value = pair.substring(eqIdx + 1).trim();
                        if (!name || !value) continue;

                        // Score: longer value = better (session tokens are long)
                        const score = value.length;
                        const existing = nativeCandidates.get(name);
                        if (!existing || score > existing.score) {
                            nativeCandidates.set(name, { value, domain: urlDomain, score });
                        }
                    }
                } catch (e) { }
            }

            // ── STEP 2: Library metadata (gets domain/expiry/path/secure) ──
            // Key fix: also use BEST VALUE WINS for lib cookies.
            const libCandidates = new Map<string, any>();

            for (const url of urlsToCheck) {
                try {
                    const got = await CookieManager.get(url);
                    if (!got || Object.keys(got).length === 0) continue;

                    for (const [name, meta] of Object.entries(got)) {
                        const m = meta as any;
                        if (!name || !m?.value) continue;

                        const score = (m.value as string).length;
                        const existing = libCandidates.get(name);
                        if (!existing || score > (existing.value?.length ?? 0)) {
                            libCandidates.set(name, m);
                        }
                    }
                } catch (e) { }
            }

            console.log('[Cookie] Native candidates:', Array.from(nativeCandidates.keys()));
            console.log('[Cookie] Lib candidates:', Array.from(libCandidates.keys()));

            // ── STEP 3: Merge — native value takes priority, lib provides metadata ──
            const finalMap = new Map<string, {
                value: string;
                domain: string;
                path: string;
                secure: boolean;
                expires: number;
            }>();

            // All unique cookie names from both sources
            const allNames = new Set([
                ...Array.from(nativeCandidates.keys()),
                ...Array.from(libCandidates.keys()),
            ]);

            for (const name of allNames) {
                const native = nativeCandidates.get(name);
                const lib = libCandidates.get(name) as any;

                // Native value is preferred (it gets HttpOnly)
                // Fall back to lib value if native missing
                const value = native?.value ?? lib?.value;
                if (!value) continue;

                // Domain: lib metadata > native extracted > default
                let domain = lib?.domain || native?.domain || defaultDomain;
                domain = CookieManagerService._normalizeDomain(domain);

                // Expiry
                let expires = CookieManagerService._defaultExpiry();
                if (lib?.expires) {
                    const ms = new Date(lib.expires).getTime();
                    if (!isNaN(ms) && ms > Date.now()) {
                        expires = Math.floor(ms / 1000);
                    }
                }

                finalMap.set(name, {
                    value,
                    domain,
                    path: lib?.path || '/',
                    secure: typeof lib?.secure === 'boolean' ? lib.secure : true,
                    expires,
                });
            }

            console.log('[Cookie] Final merged count:', finalMap.size);

            if (finalMap.size === 0) {
                console.error('[Cookie] ❌ No cookies found — user may not be logged in');
                return false;
            }

            // ── STEP 4: Check critical cookies ──
            const critical = CookieManagerService.CRITICAL_COOKIES[key] || [];
            const missing = critical.filter(c => !finalMap.has(c));
            if (missing.length > 0) {
                console.warn('[Cookie] ⚠️ Missing critical cookies:', missing);
                // Don't return false yet — still save what we have,
                // but warn the caller
            }

            // ── STEP 5: Build Netscape file ──
            let content = '# Netscape HTTP Cookie File\n';
            content += '# https://curl.haxx.se/rfc/cookie_spec.html\n\n';

            for (const [name, c] of finalMap.entries()) {
                content += [
                    c.domain,
                    'TRUE',
                    c.path,
                    c.secure ? 'TRUE' : 'FALSE',
                    c.expires,
                    name,
                    c.value,
                ].join('\t') + '\n';
            }

            console.log('[Cookie] File preview:\n', content.substring(0, 600));

            // ── STEP 6: Save ──
            const filePath = await YtDlpNative.saveCookiesToFile(content, key);
            if (!filePath) {
                console.error('[Cookie] ❌ saveCookiesToFile returned empty');
                return false;
            }

            // We no longer store the absolute cookies_path in AsyncStorage
            // to avoid sandbox path corruption on app updates.
            await AsyncStorage.setItem(
                `cookies_expiry_${key}`,
                (Date.now() + 7 * 24 * 60 * 60 * 1000).toString()
            );

            console.log(`[Cookie] ✅ Saved ${finalMap.size} cookies to ${filePath}`);
            return missing.length === 0;

        } catch (error) {
            console.error('[Cookie] extractAndSaveCookies crashed:', error);
            return false;
        }
    }

    // ─────────────────────────────────────────────
    // PUBLIC: Force re-extract (call this on login)
    // ─────────────────────────────────────────────
    static async forceRefresh(platform: string, currentUrl: string): Promise<boolean> {
        await CookieManagerService._clearStorageKeys(platform.toLowerCase());
        return CookieManagerService.extractAndSaveCookies(platform, currentUrl);
    }

    static async clearCookies(platform: string): Promise<void> {
        try { await CookieManager.clearAll(); } catch (e) { }
        await CookieManagerService._clearStorageKeys(platform.toLowerCase());
    }

    static async hasValidSession(platform: string): Promise<boolean> {
        return (await CookieManagerService.getCookiesForPlatform(platform)) !== null;
    }

    // ─────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────

    /**
     * Extracts clean ".domain.com" from a URL.
     * Strips protocol, www., m., i., login. etc.
     */
    private static _cleanDomain(url: string): string {
        try {
            const match = url.match(/^https?:\/\/([^/?#]+)/);
            if (match?.[1]) {
                // Remove known prefixes
                const host = match[1]
                    .toLowerCase()
                    .replace(/^(www|m|i|login|accounts|mobile|mtouch)\./i, '');
                return '.' + host;
            }
        } catch (e) { }
        return '.unknown.com';
    }

    /**
     * Normalizes any domain string to ".domain.tld" format.
     * Handles cases where protocol sneaks in, or leading dot is missing.
     */
    private static _normalizeDomain(domain: string): string {
        // Strip protocol
        let d = domain.replace(/^https?:\/\//i, '');
        // Strip common subdomains
        d = d.replace(/^(www|m|i|login|accounts|mobile)\./i, '');
        // Remove trailing slashes/paths
        d = d.split('/')[0];
        // Ensure leading dot
        if (!d.startsWith('.')) d = '.' + d;
        return d;
    }

    private static _defaultExpiry(): number {
        return Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000);
    }

    private static _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private static async _clearStorageKeys(key: string): Promise<void> {
        try {
            await AsyncStorage.multiRemove([
                `cookies_path_${key}`,
                `cookies_expiry_${key}`,
            ]);
        } catch (e) { }
    }
}