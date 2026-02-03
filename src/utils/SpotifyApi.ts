export const SPOTIFY_CLIENT_ID = '8bd6f4709ce348e7bfe9b564faf88ccb';
export const SPOTIFY_CLIENT_SECRET = '8b84e063943e45c39528c37dbfed037d';

let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Base64 encode function for React Native
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

interface SpotifyTrack {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    duration_ms: number;
    preview_url: string;
    external_urls: { spotify: string };
}

export interface SpotifyPlaylist {
    id: string;
    name: string;
    description: string;
    images: { url: string }[];
    tracks: {
        items: { track: SpotifyTrack }[];
        total: number;
        next: string | null;
    };
}

export const getSpotifyToken = async (): Promise<string> => {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const credentials = base64Encode(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });

        if (!response.ok) {
            throw new Error(`Failed to get Spotify token: ${response.statusText}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Expire 1 min early
        return accessToken || '';
    } catch (error) {
        console.error('Spotify token error:', error);
        throw error;
    }
};

export const getSpotifyPlaylist = async (playlistId: string): Promise<SpotifyPlaylist> => {
    const token = await getSpotifyToken();

    try {
        // Get playlist details and first batch of tracks
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,tracks.items(track(id,name,artists,album(name,images),duration_ms,preview_url,external_urls)),tracks.total,tracks.next`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Spotify playlist error:', error);
        throw error;
    }
};

export const extractSpotifyId = (url: string): { type: 'playlist' | 'track' | 'album' | null, id: string | null } => {
    const match = url.match(/spotify\.com\/(playlist|track|album)\/([a-zA-Z0-9]+)/);
    if (match) {
        return { type: match[1] as any, id: match[2] };
    }
    return { type: null, id: null };
};
