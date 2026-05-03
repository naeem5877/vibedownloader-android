import AsyncStorage from '@react-native-async-storage/async-storage';
import { YtDlpNative } from '../native/YtDlpModule';

export interface SessionData {
    cookieString: string;
    expiry: number;
}

/**
 * LocalDB Service
 * Acts as a robust local database using AsyncStorage to persist 
 * all app details like settings, login session data, and more.
 * This ensures that after app updates, the physical cookie paths
 * or files can be safely restored without forcing the user to log in again.
 */
export class LocalDB {
    private static SETTINGS_PREFIX = '@settings_';
    private static SESSION_PREFIX = '@session_';

    // ── Settings ──

    static async setSetting<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            await AsyncStorage.setItem(`${this.SETTINGS_PREFIX}${key}`, jsonValue);
        } catch (e) {
            console.error('[LocalDB] Failed to save setting:', e);
        }
    }

    static async getSetting<T>(key: string, defaultValue: T): Promise<T> {
        try {
            const jsonValue = await AsyncStorage.getItem(`${this.SETTINGS_PREFIX}${key}`);
            return jsonValue != null ? JSON.parse(jsonValue) : defaultValue;
        } catch (e) {
            console.error('[LocalDB] Failed to get setting:', e);
            return defaultValue;
        }
    }

    // ── Session (Cookies) ──

    static async saveSessionData(platform: string, cookieString: string, expiry: number): Promise<void> {
        try {
            const session: SessionData = { cookieString, expiry };
            await AsyncStorage.setItem(`${this.SESSION_PREFIX}${platform.toLowerCase()}`, JSON.stringify(session));
        } catch (e) {
            console.error('[LocalDB] Failed to save session:', e);
        }
    }

    static async getSessionData(platform: string): Promise<SessionData | null> {
        try {
            const jsonValue = await AsyncStorage.getItem(`${this.SESSION_PREFIX}${platform.toLowerCase()}`);
            return jsonValue != null ? JSON.parse(jsonValue) : null;
        } catch (e) {
            console.error('[LocalDB] Failed to get session:', e);
            return null;
        }
    }

    static async clearSessionData(platform: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(`${this.SESSION_PREFIX}${platform.toLowerCase()}`);
        } catch (e) {
            console.error('[LocalDB] Failed to clear session:', e);
        }
    }

    static async clearAllSessions(): Promise<void> {
        try {
            const platforms = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'twitch'];
            const keysToRemove = platforms.map(p => `${this.SESSION_PREFIX}${p}`);
            await AsyncStorage.multiRemove(keysToRemove);
        } catch (e) {
            console.error('[LocalDB] Failed to clear all sessions:', e);
        }
    }

    // ── Restore Utility ──

    /**
     * Call this on app startup. It checks all saved sessions and rewrites 
     * the physical cookie files if they are valid. This completely mitigates
     * the "cookie path messed up after update" bug.
     */
    static async restoreSessions(): Promise<void> {
        console.log('[LocalDB] Restoring sessions from local db...');
        const platforms = ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'twitch'];
        
        for (const platform of platforms) {
            const session = await this.getSessionData(platform);
            if (session) {
                // Check expiry
                if (Date.now() > session.expiry) {
                    console.log(`[LocalDB] Session for ${platform} expired. Clearing.`);
                    await this.clearSessionData(platform);
                    continue;
                }
                
                // Rewrite the physical file
                try {
                    const filePath = await YtDlpNative.saveCookiesToFile(session.cookieString, platform);
                    if (filePath) {
                        console.log(`[LocalDB] Successfully restored cookie file for ${platform}`);
                    }
                } catch (e) {
                    console.error(`[LocalDB] Failed to restore cookie file for ${platform}:`, e);
                }
            }
        }
    }
}
