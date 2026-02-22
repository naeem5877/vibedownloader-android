/**
 * LosslessService - Fetch lossless audio (FLAC) from Tidal via Spotify track ID
 * Inspired by SpotiFLAC / LossLessKnowlageBase
 * 
 * Flow:
 * 1. Use song.link API to resolve Spotify track → Tidal URL
 * 2. Extract Tidal track ID from URL
 * 3. Query Tidal hifi API to get direct download URL / manifest
 * 4. Return download URL for the React Native downloader to use
 */

// ── Tidal API Endpoints (from LossLessKnowlageBase) ──
const TIDAL_APIS = [
    'https://triton.squid.wtf',
    'https://hifi-one.spotisaver.net',
    'https://hifi-two.spotisaver.net',
    'https://tidal.kinoplus.online',
    'https://tidal-api.binimum.org',
];

// ── Types ──
export interface LosslessAvailability {
    available: boolean;
    tidalUrl?: string;
    tidalTrackId?: number;
    downloadUrl?: string;
    quality?: string; // 'LOSSLESS' | 'HI_RES'
    bitDepth?: number;
    sampleRate?: number;
    codec?: string;
    mimeType?: string;
    source: 'tidal' | 'none';
    apiUsed?: string;
}

export interface TidalManifestData {
    mimeType: string;
    codecs: string;
    urls: string[];
}

export interface TidalAPIResponseV2 {
    version: string;
    data: {
        trackId: number;
        assetPresentation: string;
        audioMode: string;
        audioQuality: string;
        manifestMimeType: string;
        manifestHash: string;
        manifest: string;
        bitDepth: number;
        sampleRate: number;
    };
}

export interface SongLinkResponse {
    linksByPlatform: {
        [platform: string]: {
            url: string;
        };
    };
}

// ── Helper: Base64 decode for React Native ──
function base64Decode(base64: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < base64.length; i++) {
        const charIndex = chars.indexOf(base64[i]);
        if (charIndex === -1 || charIndex === 64) continue;
        buffer = (buffer << 6) | charIndex;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            output += String.fromCharCode((buffer >> bits) & 0xFF);
        }
    }
    return output;
}

// ── SongLink API: Get Tidal URL from Spotify Track ID ──
async function getTidalUrlFromSpotify(spotifyTrackId: string): Promise<string | null> {
    const spotifyUrl = `https://open.spotify.com/track/${spotifyTrackId}`;
    const apiUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 429) {
            console.warn('[LosslessService] song.link rate limited');
            return null;
        }

        if (!response.ok) {
            console.warn(`[LosslessService] song.link returned ${response.status}`);
            return null;
        }

        const data: SongLinkResponse = await response.json();

        const tidalLink = data.linksByPlatform?.tidal;
        if (tidalLink?.url) {
            console.log(`[LosslessService] ✓ Tidal URL found: ${tidalLink.url}`);
            return tidalLink.url;
        }

        console.log('[LosslessService] ✗ No Tidal link found');
        return null;
    } catch (error: any) {
        console.error('[LosslessService] song.link error:', error.message);
        return null;
    }
}

// ── Extract Tidal Track ID from URL ──
function extractTidalTrackId(tidalUrl: string): number | null {
    const match = tidalUrl.match(/\/track\/(\d+)/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
}

// ── Query Tidal API for Download URL ──
async function getTidalDownloadUrl(
    trackId: number,
    quality: string = 'LOSSLESS',
    apiBaseUrl: string
): Promise<{ url: string; manifest?: string; quality: string; bitDepth?: number; sampleRate?: number; codec?: string; mimeType?: string } | null> {
    const apiUrl = `${apiBaseUrl}/track/?id=${trackId}&quality=${quality}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`[LosslessService] Tidal API ${apiBaseUrl} returned ${response.status}`);
            return null;
        }

        const text = await response.text();
        
        // Try V2 response (manifest-based)
        try {
            const v2: TidalAPIResponseV2 = JSON.parse(text);
            if (v2?.data?.manifest) {
                console.log(`[LosslessService] ✓ Tidal manifest found (v2 API, ${v2.data.audioQuality})`);

                // Decode manifest
                const manifestJson = base64Decode(v2.data.manifest);
                try {
                    const manifestData: TidalManifestData = JSON.parse(manifestJson);
                    if (manifestData.urls && manifestData.urls.length > 0) {
                        return {
                            url: manifestData.urls[0],
                            quality: v2.data.audioQuality || quality,
                            bitDepth: v2.data.bitDepth,
                            sampleRate: v2.data.sampleRate,
                            codec: manifestData.codecs,
                            mimeType: manifestData.mimeType,
                        };
                    }
                } catch {
                    // Manifest might be XML (DASH), not JSON
                    console.log('[LosslessService] Manifest is not BTS JSON, likely DASH MPD');
                    return null;
                }
            }
        } catch {}

        // Try V1 array response (direct URL)
        try {
            const v1 = JSON.parse(text);
            if (Array.isArray(v1) && v1.length > 0) {
                for (const item of v1) {
                    if (item.OriginalTrackUrl) {
                        console.log('[LosslessService] ✓ Tidal direct URL found (v1 API)');
                        return {
                            url: item.OriginalTrackUrl,
                            quality,
                        };
                    }
                }
            }
        } catch {}

        return null;
    } catch (error: any) {
        console.warn(`[LosslessService] Tidal API error (${apiBaseUrl}):`, error.message);
        return null;
    }
}

// ── Main: Check Lossless Availability (with API rotation) ──
export async function checkLosslessAvailability(spotifyTrackId: string): Promise<LosslessAvailability> {
    const result: LosslessAvailability = {
        available: false,
        source: 'none',
    };

    if (!spotifyTrackId) return result;

    // Step 1: Get Tidal URL from song.link
    const tidalUrl = await getTidalUrlFromSpotify(spotifyTrackId);
    if (!tidalUrl) return result;

    result.tidalUrl = tidalUrl;

    // Step 2: Extract Tidal track ID
    const trackId = extractTidalTrackId(tidalUrl);
    if (!trackId) return result;

    result.tidalTrackId = trackId;

    // Step 3: Try each Tidal API endpoint with rotation
    const shuffledApis = [...TIDAL_APIS].sort(() => Math.random() - 0.5);

    for (const api of shuffledApis) {
        // Try LOSSLESS first
        const downloadInfo = await getTidalDownloadUrl(trackId, 'LOSSLESS', api);
        if (downloadInfo) {
            result.available = true;
            result.downloadUrl = downloadInfo.url;
            result.quality = downloadInfo.quality;
            result.bitDepth = downloadInfo.bitDepth || 16;
            result.sampleRate = downloadInfo.sampleRate || 44100;
            result.codec = downloadInfo.codec || 'FLAC';
            result.mimeType = downloadInfo.mimeType;
            result.source = 'tidal';
            result.apiUsed = api;
            return result;
        }
    }

    return result;
}

// ── Get Direct Download URL (for the actual download) ──
export async function getLosslessDownloadUrl(spotifyTrackId: string): Promise<{
    url: string;
    quality: string;
    bitDepth: number;
    sampleRate: number;
    codec: string;
} | null> {
    const availability = await checkLosslessAvailability(spotifyTrackId);
    if (!availability.available || !availability.downloadUrl) {
        return null;
    }

    return {
        url: availability.downloadUrl,
        quality: availability.quality || 'LOSSLESS',
        bitDepth: availability.bitDepth || 16,
        sampleRate: availability.sampleRate || 44100,
        codec: availability.codec || 'FLAC',
    };
}

// ── Format Quality Label for UI ──
export function formatQualityLabel(bitDepth?: number, sampleRate?: number): string {
    if (!bitDepth && !sampleRate) return 'FLAC Lossless';
    const bits = bitDepth || 16;
    const rate = sampleRate ? (sampleRate / 1000).toFixed(1) : '44.1';
    return `${bits}-bit / ${rate}kHz`;
}

// ── Format Source Label ──
export function formatSourceLabel(source: string): string {
    switch (source) {
        case 'tidal': return 'Tidal';
        default: return 'Unknown';
    }
}

export default {
    checkLosslessAvailability,
    getLosslessDownloadUrl,
    formatQualityLabel,
    formatSourceLabel,
};
