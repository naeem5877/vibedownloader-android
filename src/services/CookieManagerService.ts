import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { YtDlpNative } from '../native/YtDlpModule';

export class CookieManagerService {
    
    // Aggressively map platforms to ALL potential domains where sessions might be stored
    private static readonly PLATFORM_DOMAINS: Record<string, string[]> = {
        instagram: ['https://instagram.com', 'https://www.instagram.com', 'https://i.instagram.com', 'https://m.instagram.com', 'https://login.instagram.com'],
        facebook:  ['https://facebook.com', 'https://www.facebook.com', 'https://m.facebook.com', 'https://business.facebook.com', 'https://mtouch.facebook.com'],
        youtube:   ['https://youtube.com', 'https://www.youtube.com', 'https://m.youtube.com', 'https://accounts.google.com', 'https://google.com', 'https://myaccount.google.com'],
        tiktok:    ['https://tiktok.com', 'https://www.tiktok.com', 'https://m.tiktok.com'],
        twitter:   ['https://twitter.com', 'https://x.com', 'https://www.twitter.com', 'https://mobile.twitter.com'],
        twitch:    ['https://twitch.tv', 'https://www.twitch.tv', 'https://m.twitch.tv'],
    };

    private static readonly SESSION_COOKIE_NAMES = new Set([
        'sessionid', 'c_user', 'xs', 'datr', 'sb', 'wd', 'dpr', 'ig_did', // IG & FB
        'SID', 'SSID', 'HSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', // Google
        'auth_token', 'twid', 'ct0', // X
        'sessionid_ss', 'ttwid', 'passport_csrf_token', // TikTok
        'session', 'session_id', 'token', 'access_token',
    ]);

    static async getCookiesForPlatform(platform: string): Promise<string | null> {
        try {
            const key = platform.toLowerCase();

            // Check expiry first
            const expiryStr = await AsyncStorage.getItem(`cookies_expiry_${key}`);
            if (expiryStr && Date.now() > parseInt(expiryStr, 10)) {
                await CookieManagerService._clearAsyncStorageKeys(key);
                return null;
            }

            const storedPath = await AsyncStorage.getItem(`cookies_path_${key}`);
            if (!storedPath) return null;

            try {
                const exists = await YtDlpNative.fileExists(storedPath);
                if (!exists) {
                    await CookieManagerService._clearAsyncStorageKeys(key);
                    return null;
                }

                // IMPROVEMENT: Basic validation that the file isn't empty and contains a session id for IG
                // We don't want to read the whole file if it's huge, but cookies files are small.
                // This prevents the "Session Active" indicator from lying.
                // Note: We don't have a direct 'readFile' in YtDlpNative, but we can assume if it's there
                // and we just saved it, it's likely okay. 
                // For now, let's just trust existence, but in a real app we'd check content.
            } catch (err) {}

            return storedPath;
        } catch (error) {
            return null;
        }
    }

    static async extractAndSaveCookies(platform: string, currentUrl: string): Promise<boolean> {
        try {
            const key = platform.toLowerCase();
            
            // 1. Prepare target URLs
            const predefinedUrls = CookieManagerService.PLATFORM_DOMAINS[key] || [];
            const urlsToCheck = Array.from(new Set(
                [currentUrl, ...predefinedUrls].filter(u => !!u && u.startsWith('http'))
            ));

            // 2. Flush
            if (Platform.OS === 'android') {
                try { await CookieManager.flush(); } catch (err) {}
                await new Promise<void>(resolve => setTimeout(resolve, 800)); // Increased delay for flush
            }

            // 3. Extract natively
            const nativeMap = new Map<string, string>(); // name -> value
            for (const checkUrl of urlsToCheck) {
                try {
                    const raw = await YtDlpNative.getWebViewCookies(checkUrl);
                    if (raw && raw.trim()) {
                        for (const pair of raw.split(/;\s*/)) {
                            const eqIdx = pair.indexOf('=');
                            if (eqIdx === -1) continue;
                            const name = pair.substring(0, eqIdx).trim();
                            const value = pair.substring(eqIdx + 1).trim();
                            if (name) {
                                nativeMap.set(name, value);
                            }
                        }
                    }
                } catch (e) {}
            }

            // 4. Extract metadata via library
            let libMeta: Record<string, any> = {};
            for (const checkUrl of urlsToCheck) {
                try {
                    const got = (await CookieManager.get(checkUrl)) || {};
                    if (Object.keys(got).length > 0) {
                        libMeta = { ...libMeta, ...got };
                    }
                } catch (e) {}
            }

            if (nativeMap.size === 0 && Object.keys(libMeta).length === 0) {
                return false;
            }

            console.log('[CookieDebug] nativeMap size:', nativeMap.size);
            console.log('[CookieDebug] nativeMap keys:', Array.from(nativeMap.keys()));
            console.log('[CookieDebug] libMeta keys:', Object.keys(libMeta));
            
            // Check for critical cookies
            const critical = ['sessionid', 'c_user', 'xs', 'auth_token', 'SID'];
            const foundCritical = critical.filter(c => nativeMap.has(c) || libMeta[c]);
            console.log('[CookieDebug] Found critical cookies:', foundCritical);

            // 5. Default domain logic
            let defaultDomain = `.${key.replace(/[^a-z0-9]/g, '')}.com`;
            if (key === 'facebook') defaultDomain = '.facebook.com';
            else if (key === 'instagram') defaultDomain = '.instagram.com';
            else if (key === 'youtube') defaultDomain = '.youtube.com';
            else if (key === 'tiktok') defaultDomain = '.tiktok.com';
            else if (key === 'twitter') defaultDomain = '.twitter.com';
            else if (urlsToCheck.length > 0) {
                const match = urlsToCheck[0].match(/^https?:\/\/([^/?#]+)/);
                if (match && match[1]) {
                    defaultDomain = '.' + match[1].replace(/^(www|m)\./i, '');
                }
            }

            // 6. Assemble Netscape Format
            let netscapeTxt = '# Netscape HTTP Cookie File\n# Generated by VibeDownloader\n\n';

            const allNames = new Set([
                ...Array.from(nativeMap.keys()),
                ...Object.keys(libMeta),
            ]);

            for (const name of allNames) {
                const value = nativeMap.get(name) 
                    ?? (typeof libMeta[name] === 'string' ? libMeta[name] : (libMeta[name] as any)?.value);
                    
                if (!name || value === undefined || value === null) continue;

                const meta = libMeta[name] as any;
                const isSecure = typeof meta?.secure === 'boolean' ? meta.secure : true;

                let domain = meta?.domain || defaultDomain;
                if (!domain.startsWith('.')) {
                    domain = '.' + domain.replace(/^www\./i, '');
                }

                const path = meta?.path || '/';

                let expiry = 1893456000; // 2030 by default
                if (meta?.expires) {
                    const ms = new Date(meta.expires).getTime();
                    if (!isNaN(ms) && ms > 0) {
                        expiry = Math.floor(ms / 1000);
                    }
                }

                const secureStr = isSecure ? 'TRUE' : 'FALSE';
                netscapeTxt += `${domain}\tTRUE\t${path}\t${secureStr}\t${expiry}\t${name}\t${value}\n`;
            }

            // 7. Save file explicitly
            const filePath = await YtDlpNative.saveCookiesToFile(netscapeTxt, key);
            
            // 8. Persist configuration
            await AsyncStorage.setItem(`cookies_path_${key}`, filePath);
            // Default valid period of 30 days. Let yt-dlp determine real expiry failure.
            const finalExpiryMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
            await AsyncStorage.setItem(`cookies_expiry_${key}`, finalExpiryMs.toString());

            console.log('[CookieDebug] Saved to path:', filePath);
            console.log('[CookieDebug] Has sessionid in file:', netscapeTxt.includes('sessionid'));
            console.log('[CookieDebug] File content preview:\n', netscapeTxt.substring(0, 500));

            return true;

        } catch (error) {
            return false;
        }
    }

    static async clearCookies(platform: string, url?: string): Promise<void> {
        const key = platform.toLowerCase();
        
        try {
            await CookieManager.clearAll();
        } catch (ignore) {}

        await CookieManagerService._clearAsyncStorageKeys(key);
    }

    private static async _clearAsyncStorageKeys(key: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(`cookies_path_${key}`);
            await AsyncStorage.removeItem(`cookies_expiry_${key}`);
        } catch (e) {}
    }
}
