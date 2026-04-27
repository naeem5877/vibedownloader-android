import { Buffer } from 'buffer';

// Ensure Buffer is globally available for libraries that expect it (like spotify-url-info)
if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// Patch JSON.parse to handle Buffers if the JS engine is strict (like some versions of Hermes)
const originalJsonParse = JSON.parse;
(globalThis as any).JSON.parse = function(text: any, reviver?: any) {
    if (text && typeof text === 'object' && (text.type === 'Buffer' || text.constructor?.name === 'Buffer' || Buffer.isBuffer(text))) {
        return originalJsonParse.call(JSON, text.toString(), reviver);
    }
    // Also handle Uint8Array which Buffer polyfill might be
    if (text instanceof Uint8Array && !(typeof text === 'string')) {
        return originalJsonParse.call(JSON, Buffer.from(text).toString(), reviver);
    }
    return originalJsonParse.call(JSON, text, reviver);
};

// Removed spotify-url-info as it is problematic in React Native/Hermes

/**
 * Custom fetch for React Native to bypass Spotify blocking
 */
const customFetch = async (url: any, options?: RequestInit) => {
    const finalUrl = url instanceof URL ? url.toString() : url;
    
    // Create a clean headers object
    const headers = new Headers();
    headers.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    headers.append('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
    headers.append('Accept-Language', 'en-US,en;q=0.9');
    headers.append('Sec-Fetch-Dest', 'document');
    headers.append('Sec-Fetch-Mode', 'navigate');
    headers.append('Sec-Fetch-Site', 'none');
    headers.append('Sec-Fetch-User', '?1');
    headers.append('Upgrade-Insecure-Requests', '1');

    // Merge existing headers if any
    if (options?.headers) {
        if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => {
                headers.set(key, value);
            });
        } else if (Array.isArray(options.headers)) {
            options.headers.forEach(([key, value]) => {
                headers.set(key, value);
            });
        } else {
            Object.entries(options.headers).forEach(([key, value]) => {
                headers.set(key, value);
            });
        }
    }

    try {
        const response = await fetch(finalUrl, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            console.warn(`[SpotifyService] Fetch failed with status ${response.status} for ${finalUrl}`);
        }
        
        return response;
    } catch (error) {
        console.error('[SpotifyService] Fetch error:', error);
        throw error;
    }
};

// Use native fetch instead of spotify-url-info

export interface SpotifyArtist {
    id: string;
    name: string;
    external_urls: { spotify: string };
}

export interface SpotifyAlbum {
    id: string;
    name: string;
    images: { url: string; height: number; width: number }[];
    release_date: string;
    total_tracks: number;
}

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
    duration_ms: number;
    explicit: boolean;
    preview_url: string | null;
    external_urls: { spotify: string };
    track_number: number;
}

export interface SpotifyPlaylist {
    id: string;
    name: string;
    description: string;
    images: { url: string }[];
    owner: { display_name: string };
    tracks: {
        total: number;
        items: { track: SpotifyTrack }[];
    };
}

/**
 * Extract Spotify ID from URL
 */
export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    // Accounts for optional locale segments like /intl-pt/ or /en-US/
    const match = url.match(/spotify\.com\/(?:[a-z]{2}-[a-z]{2}\/|intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
        return {
            type: match[1] as 'track' | 'album' | 'playlist',
            id: match[2]
        };
    }
    return null;
}

/**
 * Get track metadata from Spotify using oEmbed (free, no auth, reliable on mobile)
 */
export async function getTrackInfo(trackId: string): Promise<SpotifyTrack> {
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        
        const response = await fetch(oembedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(`oEmbed failed: ${response.status}`);
        
        const data = await response.json();
        
        return {
            id: trackId,
            name: data.title || "Unknown Track",
            artists: [{ 
                id: "", 
                name: data.author_name || "Unknown Artist", 
                external_urls: { spotify: "" } 
            }],
            album: {
                id: "",
                name: data.album_name || data.title || "Unknown Album",
                images: [{ url: data.thumbnail_url || '', height: 640, width: 640 }],
                release_date: "",
                total_tracks: 1
            },
            duration_ms: 0,
            explicit: false,
            preview_url: null,
            external_urls: { spotify: spotifyUrl },
            track_number: 1,
        };
    } catch (e) {
        console.warn('[SpotifyService] oEmbed fetch failed, trying OG fallback...', e);
        try {
            return await fetchSpotifyOGFallback(spotifyUrl, 'track');
        } catch (fallbackError) {
            throw new Error('Failed to fetch Spotify track: ' + String(e));
        }
    }
}

/**
 * Robust fallback for Spotify metadata by scraping Open Graph tags
 */
async function fetchSpotifyOGFallback(url: string, type: 'track' | 'album' | 'playlist'): Promise<any> {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'VibeDownloader/1.2.1'
    ];

    let html = '';
    let success = false;
    let lastError: any = null;

    for (const ua of uas) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            if (response.ok) {
                html = await response.text();
                success = true;
                break;
            } else {
                console.warn(`[Spotify Fallback] UA attempt failed with status ${response.status}`);
            }
        } catch (e) {
            lastError = e;
            console.warn(`[Spotify Fallback] UA attempt failed with error`, e);
        }
    }

    if (!success) {
        throw lastError || new Error("Spotify metadata unavailable via OG fallback.");
    }

    const getMeta = (prop: string) => {
        const match = html.match(new RegExp(`<meta property="${prop}" content="(.*?)"`, 'i')) ||
                      html.match(new RegExp(`<meta content="(.*?)" property="${prop}"`, 'i'));
        return match ? match[1] : null;
    };

    const title = getMeta('og:title') || 'Unknown Title';
    const image = getMeta('og:image') || '';
    const desc = getMeta('og:description') || '';

    let artist = 'Unknown Artist';
    if (type === 'track') {
        // Description for tracks is usually "Artist · Song · Year"
        const parts = desc.split(' · ');
        if (parts.length > 0) artist = parts[0];
        
        return {
            id: url.split('/').pop()?.split('?')[0] || '',
            name: title,
            artists: [{ id: "", name: artist, external_urls: { spotify: "" } }],
            album: {
                id: "",
                name: title, // We don't have album name in OG tags easily
                images: [{ url: image, height: 640, width: 640 }],
                release_date: "",
                total_tracks: 1
            },
            duration_ms: 0,
            explicit: false,
            preview_url: null,
            external_urls: { spotify: url },
            track_number: 1,
        };
    }

    // Albums/Playlists are similar
    return {
        id: url.split('/').pop()?.split('?')[0] || '',
        name: title,
        description: desc,
        images: [{ url: image }],
        owner: { display_name: artist },
        tracks: {
            total: 0,
            items: [], // OG tags don't show track lists
        }
    };
}

/**
 * Get full playlist data from Spotify using oEmbed and OG scraping
 */
export async function getSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const response = await fetch(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const oembedData = response.ok ? await response.json() : null;
        const fallbackData = await fetchSpotifyOGFallback(spotifyUrl, 'playlist');

        return {
            id: playlistId,
            name: oembedData?.title || fallbackData.name || "Spotify Playlist",
            description: fallbackData.description || "",
            images: [{ url: oembedData?.thumbnail_url || fallbackData.images?.[0]?.url || '' }],
            owner: { display_name: oembedData?.author_name || fallbackData.owner?.display_name || "Spotify" },
            tracks: {
                total: fallbackData.tracks?.total || 0,
                items: fallbackData.tracks?.items || [],
            }
        };
    } catch (e) {
        console.warn('[SpotifyService] Playlist fetch failed:', e);
        throw new Error('Failed to fetch playlist from Spotify: ' + String(e));
    }
}

/**
 * Get full album data from Spotify
 */
export async function getSpotifyAlbum(albumId: string): Promise<any> {
    const spotifyUrl = `https://open.spotify.com/album/${albumId}`;
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const response = await fetch(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const oembedData = response.ok ? await response.json() : null;
        const fallbackData = await fetchSpotifyOGFallback(spotifyUrl, 'album');

        return {
            id: albumId,
            name: oembedData?.title || fallbackData.name || "Spotify Album",
            images: [{ url: oembedData?.thumbnail_url || fallbackData.images?.[0]?.url || '' }],
            release_date: fallbackData.release_date || "",
            total_tracks: fallbackData.total_tracks || 0,
            tracks: {
                items: fallbackData.tracks?.items || []
            }
        };
    } catch (e) {
        console.warn('[SpotifyService] Album fetch failed:', e);
        throw new Error('Failed to fetch album from Spotify: ' + String(e));
    }
}

/**
 * Get album tracks from Spotify
 */
export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    const albumData = await getSpotifyAlbum(albumId);
    return albumData.tracks.items;
}

/**
 * Get playlist tracks from Spotify (helper)
 */
export async function getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const data = await getSpotifyPlaylist(playlistId);
    return data.tracks.items.map(item => item.track).filter(Boolean);
}

/**
 * Build YouTube search query from Spotify track
 */
export function buildYouTubeSearchQuery(track: SpotifyTrack): string {
    const artists = track.artists.map(a => a.name).join(' ');
    // Remove anything after a comma if multiple artists are grouped in one string by the library
    const safeArtists = artists.split(',').join(' ');
    return `${track.name} ${safeArtists} audio`;
}

/**
 * Get high quality thumbnail URL from Spotify album
 */
export function getHighQualityThumbnail(track: SpotifyTrack): string {
    const images = track.album?.images || [];
    if (images.length === 0) return '';
    // Return the first image, usually the highest res (640x640)
    return images[0].url;
}

/**
 * Format track metadata for display
 */
export function formatTrackMetadata(track: SpotifyTrack) {
    return {
        title: track.name,
        // The scraping lib might already comma-separate artists. Ensure it looks clean.
        artist: track.artists.map(a => a.name).join(', ').replace(/,\s*,/g, ','),
        album: track.album?.name || "Unknown",
        releaseDate: track.album?.release_date || "",
        duration: Math.floor(track.duration_ms / 1000),
        thumbnail: getHighQualityThumbnail(track),
        trackNumber: track.track_number,
        explicit: track.explicit,
        spotifyUrl: track.external_urls?.spotify || "",
    };
}

export default {
    extractSpotifyId,
    getTrackInfo,
    getAlbumTracks,
    getPlaylistTracks,
    getSpotifyPlaylist,
    getSpotifyAlbum,
    buildYouTubeSearchQuery,
    getHighQualityThumbnail,
    formatTrackMetadata,
};
