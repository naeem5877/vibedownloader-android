/**
 * SpotifyService - Fetch track metadata from Spotify API
 */

const SPOTIFY_CLIENT_ID = '8bd6f4709ce348e7bfe9b564faf88ccb';
const SPOTIFY_CLIENT_SECRET = '8b84e063943e45c39528c37dbfed037d';

interface SpotifyToken {
    access_token: string;
    token_type: string;
    expires_in: number;
    expiry_time: number;
}

interface SpotifyArtist {
    id: string;
    name: string;
    external_urls: { spotify: string };
}

interface SpotifyAlbum {
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

let cachedToken: SpotifyToken | null = null;

/**
 * Base64 encode function for React Native
 */
function base64Encode(str: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';

    for (let i = 0; i < str.length; i += 3) {
        const chr1 = str.charCodeAt(i);
        const chr2 = str.charCodeAt(i + 1);
        const chr3 = str.charCodeAt(i + 2);

        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        const enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
        const enc4 = isNaN(chr3) ? 64 : chr3 & 63;

        output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
    }

    return output;
}

/**
 * Get Spotify access token using client credentials flow
 */
async function getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (cachedToken && cachedToken.expiry_time > Date.now()) {
        return cachedToken.access_token;
    }

    const credentials = base64Encode(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`,
            },
            body: 'grant_type=client_credentials',
        });

        if (!response.ok) {
            throw new Error(`Spotify auth failed: ${response.status}`);
        }

        const data = await response.json();

        cachedToken = {
            ...data,
            expiry_time: Date.now() + (data.expires_in * 1000) - 60000, // 1 min buffer
        };

        return data.access_token;
    } catch (error) {
        console.error('Spotify auth error:', error);
        throw new Error('Failed to authenticate with Spotify');
    }
}

/**
 * Extract Spotify ID from URL
 */
export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    const patterns = [
        /spotify\.com\/track\/([a-zA-Z0-9]+)/,
        /spotify\.com\/album\/([a-zA-Z0-9]+)/,
        /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            if (url.includes('/track/')) {
                return { type: 'track', id: match[1] };
            } else if (url.includes('/album/')) {
                return { type: 'album', id: match[1] };
            } else if (url.includes('/playlist/')) {
                return { type: 'playlist', id: match[1] };
            }
        }
    }
    return null;
}

/**
 * Get track metadata from Spotify
 */
export async function getTrackInfo(trackId: string): Promise<SpotifyTrack> {
    const token = await getAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch track: ${response.status}`);
    }

    return response.json();
}

/**
 * Get album tracks from Spotify
 */
export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    const token = await getAccessToken();

    // First get album info
    const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!albumResponse.ok) {
        throw new Error(`Failed to fetch album: ${albumResponse.status}`);
    }

    const albumData = await albumResponse.json();

    // Get full track info
    const tracks: SpotifyTrack[] = [];
    for (const item of albumData.tracks.items) {
        const trackInfo = await getTrackInfo(item.id);
        tracks.push(trackInfo);
    }

    return tracks;
}

/**
 * Get playlist tracks from Spotify
 */
export async function getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const token = await getAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch playlist: ${response.status}`);
    }

    const data: SpotifyPlaylist = await response.json();
    return data.tracks.items.map(item => item.track).filter(Boolean);
}

/**
 * Build YouTube search query from Spotify track
 */
export function buildYouTubeSearchQuery(track: SpotifyTrack): string {
    const artists = track.artists.map(a => a.name).join(' ');
    return `${track.name} ${artists} audio`;
}

/**
 * Get high quality thumbnail URL from Spotify album
 */
export function getHighQualityThumbnail(track: SpotifyTrack): string {
    const images = track.album.images;
    if (images.length === 0) return '';

    // Sort by size (largest first) and return the best
    const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
    return sorted[0].url;
}

/**
 * Format track metadata for display
 */
export function formatTrackMetadata(track: SpotifyTrack) {
    return {
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        releaseDate: track.album.release_date,
        duration: Math.floor(track.duration_ms / 1000),
        thumbnail: getHighQualityThumbnail(track),
        trackNumber: track.track_number,
        explicit: track.explicit,
        spotifyUrl: track.external_urls.spotify,
    };
}

export default {
    extractSpotifyId,
    getTrackInfo,
    getAlbumTracks,
    getPlaylistTracks,
    buildYouTubeSearchQuery,
    getHighQualityThumbnail,
    formatTrackMetadata,
};
