import { Buffer } from 'buffer';

if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── extractSpotifyId ─────────────────────────────────────────────────────────

export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    const match = url.match(/spotify\.com\/(?:[a-z]{2}-[a-z]{2}\/|intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
        return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
}

// ─── Method 1: oEmbed ────────────────────────────────────────────────────────
// NOTE: Spotify removed author_name from oEmbed in 2024/2025.
// oEmbed now only reliably gives: title + thumbnail_url.

async function tryOEmbed(spotifyUrl: string): Promise<{ title: string; thumbnail: string } | null> {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    console.log('[Spotify:oEmbed] →', oembedUrl);
    try {
        const res = await fetch(oembedUrl, { headers: { 'User-Agent': UA } });
        console.log('[Spotify:oEmbed] Status:', res.status);
        if (!res.ok) return null;
        const data = await res.json();
        console.log('[Spotify:oEmbed] title:', data.title, '| thumbnail:', data.thumbnail_url?.slice(0, 60));
        return { title: data.title || '', thumbnail: data.thumbnail_url || '' };
    } catch (e: any) {
        console.error('[Spotify:oEmbed] Exception:', e?.message);
        return null;
    }
}

// ─── Method 2: Embed page __NEXT_DATA__ ──────────────────────────────────────
// Confirmed working 2025. Entity shape from live API:
//   entity.name          → track title
//   entity.artists[]     → [{ name, uri }]  (FLAT array, no .profile.name)
//   entity.visualIdentity.image[] → [{ url, maxWidth, maxHeight }]
//   entity.duration      → milliseconds (direct number)
//   entity.isExplicit    → boolean
//   entity.audioPreview.url → preview mp3
//   entity.releaseDate.isoString → "2022-10-21T00:00:00Z"

async function tryEmbedPage(trackId: string, oembedThumbnail?: string): Promise<SpotifyTrack | null> {
    const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
    console.log('[Spotify:Embed] →', embedUrl);
    try {
        const res = await fetch(embedUrl, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        console.log('[Spotify:Embed] Status:', res.status);
        if (!res.ok) return null;

        const html = await res.text();
        console.log('[Spotify:Embed] HTML length:', html.length);

        // Use indexOf (avoids regex multiline issues in Hermes JS engine)
        const TAG = '__NEXT_DATA__';
        const tagIdx = html.indexOf(TAG);
        if (tagIdx === -1) {
            console.warn('[Spotify:Embed] __NEXT_DATA__ NOT found');
            return null;
        }
        const jsonStart = html.indexOf('>', tagIdx) + 1;
        const jsonEnd = html.indexOf('</script>', jsonStart);
        const jsonStr = html.slice(jsonStart, jsonEnd);
        console.log('[Spotify:Embed] __NEXT_DATA__ length:', jsonStr.length);

        const nextData = JSON.parse(jsonStr);
        const pageProps = nextData?.props?.pageProps;
        console.log('[Spotify:Embed] pageProps keys:', Object.keys(pageProps || {}));

        // Confirmed path (Spotify embed 2025): pageProps.state.data.entity
        const entity =
            pageProps?.state?.data?.entity ||
            pageProps?.track ||
            pageProps?.data?.track?.track;

        if (!entity || entity.type !== 'track') {
            console.warn('[Spotify:Embed] Entity not found or wrong type (type=' + entity?.type + ')');
            console.warn('[Spotify:Embed] state.data keys:', Object.keys(pageProps?.state?.data || {}));
            console.warn('[Spotify:Embed] pageProps (800 chars):', JSON.stringify(pageProps).slice(0, 800));
            return null;
        }

        console.log('[Spotify:Embed] Entity OK → name:', entity.name);

        // Artists: confirmed flat array { name, uri }
        const rawArtists: any[] = entity.artists || [];
        const artists: SpotifyArtist[] = rawArtists.map((a: any) => ({
            id: a.uri?.split(':').pop() || '',
            name: a.name || 'Unknown Artist',
            external_urls: { spotify: `https://open.spotify.com/artist/${a.uri?.split(':').pop() || ''}` },
        }));
        console.log('[Spotify:Embed] Artists:', artists.map(a => a.name).join(', ') || '(none)');

        // Images: entity.visualIdentity.image[], sort largest first
        const rawImages: any[] = entity.visualIdentity?.image || [];
        let images = rawImages
            .sort((a: any, b: any) => (b.maxWidth || 0) - (a.maxWidth || 0))
            .map((img: any) => ({ url: img.url || '', height: img.maxHeight || 640, width: img.maxWidth || 640 }));
        console.log('[Spotify:Embed] Images count:', images.length);

        // Fall back to oEmbed thumbnail if none found
        if (images.length === 0 && oembedThumbnail) {
            images = [{ url: oembedThumbnail, height: 640, width: 640 }];
            console.log('[Spotify:Embed] Using oEmbed thumbnail as fallback');
        }

        const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
        return {
            id: entity.id || trackId,
            name: entity.name || entity.title || 'Unknown Track',
            artists: artists.length > 0 ? artists : [{ id: '', name: 'Unknown Artist', external_urls: { spotify: '' } }],
            album: {
                id: '',
                // Album data is not included in the embed entity — using track name as placeholder
                name: entity.name || 'Unknown Album',
                images,
                release_date: entity.releaseDate?.isoString?.split('T')[0] || '',
                total_tracks: 1,
            },
            duration_ms: entity.duration || 0,
            explicit: entity.isExplicit || false,
            preview_url: entity.audioPreview?.url || null,
            external_urls: { spotify: spotifyUrl },
            track_number: 1,
        };
    } catch (e: any) {
        console.error('[Spotify:Embed] Exception:', e?.message);
        return null;
    }
}

// ─── Method 3: OG tag scraping ───────────────────────────────────────────────

async function tryOGFallback(url: string, type: 'track' | 'album' | 'playlist'): Promise<any> {
    console.log('[Spotify:OG] →', url);
    let html = '';
    for (const ua of [UA, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)']) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
            console.log('[Spotify:OG] Status:', res.status, '(UA:', ua.slice(0, 30) + ')');
            if (res.ok) { html = await res.text(); break; }
        } catch (e: any) {
            console.warn('[Spotify:OG] Fetch error:', e?.message);
        }
    }
    if (!html) throw new Error('OG fallback: all requests failed');

    const getMeta = (prop: string) => {
        const m = html.match(new RegExp(`<meta property="${prop}" content="(.*?)"`, 'i')) ||
                  html.match(new RegExp(`<meta content="(.*?)" property="${prop}"`, 'i'));
        return m ? m[1] : null;
    };

    const title = getMeta('og:title') || 'Unknown Title';
    const image = getMeta('og:image') || '';
    const desc = getMeta('og:description') || '';
    console.log('[Spotify:OG] og:title:', title, '| og:description:', desc);

    let artist = 'Unknown Artist';
    if (type === 'track') {
        // Spotify OG description format: "Artist · Song · Year"
        const parts = desc.split(' · ');
        console.log('[Spotify:OG] Description parts:', parts);
        if (parts.length >= 1) artist = parts[0];
        return {
            id: url.split('/').pop()?.split('?')[0] || '',
            name: title,
            artists: [{ id: '', name: artist, external_urls: { spotify: '' } }],
            album: { id: '', name: title, images: [{ url: image, height: 640, width: 640 }], release_date: '', total_tracks: 1 },
            duration_ms: 0, explicit: false, preview_url: null,
            external_urls: { spotify: url }, track_number: 1,
        };
    }
    return {
        id: url.split('/').pop()?.split('?')[0] || '',
        name: title, description: desc,
        images: [{ url: image }],
        owner: { display_name: artist },
        tracks: { total: 0, items: [] },
    };
}

// ─── getTrackInfo (public) ────────────────────────────────────────────────────

/**
 * Get Spotify track metadata.
 * Chain: oEmbed (title+thumbnail) → Embed __NEXT_DATA__ (full data) → OG fallback
 */
export async function getTrackInfo(trackId: string): Promise<SpotifyTrack> {
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    console.log('[Spotify] ─── getTrackInfo ───', trackId);

    // 1. oEmbed — just for title + thumbnail (author_name no longer returned by Spotify)
    const oembed = await tryOEmbed(spotifyUrl);
    console.log('[Spotify] oEmbed:', oembed ? `"${oembed.title}"` : 'null');

    // 2. Embed page — primary source of artist + full data
    const embedResult = await tryEmbedPage(trackId, oembed?.thumbnail);
    if (embedResult) {
        console.log('[Spotify] ✅ Embed page OK → artists:', embedResult.artists.map(a => a.name).join(', '));
        return embedResult;
    }
    console.warn('[Spotify] Embed page failed → trying OG fallback');

    // 3. OG fallback
    try {
        const og = await tryOGFallback(spotifyUrl, 'track');
        console.log('[Spotify] ✅ OG fallback OK → artist:', og?.artists?.[0]?.name);
        return og as SpotifyTrack;
    } catch (e: any) {
        console.error('[Spotify] ❌ ALL methods failed:', e?.message);
        throw new Error('Failed to fetch Spotify track info. Check your internet connection.');
    }
}

// ─── getSpotifyPlaylist (public) ──────────────────────────────────────────────

export async function getSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;
    console.log('[Spotify] ─── getSpotifyPlaylist ───', playlistId);
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const res = await fetch(oembedUrl, { headers: { 'User-Agent': UA } });
        console.log('[Spotify:Playlist:oEmbed] Status:', res.status);
        const oembedData = res.ok ? await res.json() : null;
        console.log('[Spotify:Playlist:oEmbed] title:', oembedData?.title);

        const fallback = await tryOGFallback(spotifyUrl, 'playlist');
        return {
            id: playlistId,
            name: oembedData?.title || fallback.name || 'Spotify Playlist',
            description: fallback.description || '',
            images: [{ url: oembedData?.thumbnail_url || fallback.images?.[0]?.url || '' }],
            owner: { display_name: oembedData?.author_name || fallback.owner?.display_name || 'Spotify' },
            tracks: { total: fallback.tracks?.total || 0, items: fallback.tracks?.items || [] },
        };
    } catch (e: any) {
        console.error('[Spotify] ❌ Playlist fetch failed:', e?.message);
        throw new Error('Failed to fetch Spotify playlist: ' + String(e));
    }
}

// ─── getSpotifyAlbum (public) ─────────────────────────────────────────────────

export async function getSpotifyAlbum(albumId: string): Promise<any> {
    const spotifyUrl = `https://open.spotify.com/album/${albumId}`;
    console.log('[Spotify] ─── getSpotifyAlbum ───', albumId);
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const res = await fetch(oembedUrl, { headers: { 'User-Agent': UA } });
        const oembedData = res.ok ? await res.json() : null;
        const fallback = await tryOGFallback(spotifyUrl, 'album');
        return {
            id: albumId,
            name: oembedData?.title || fallback.name || 'Spotify Album',
            images: [{ url: oembedData?.thumbnail_url || fallback.images?.[0]?.url || '' }],
            release_date: fallback.release_date || '',
            total_tracks: fallback.total_tracks || 0,
            tracks: { items: fallback.tracks?.items || [] },
        };
    } catch (e: any) {
        console.error('[Spotify] ❌ Album fetch failed:', e?.message);
        throw new Error('Failed to fetch Spotify album: ' + String(e));
    }
}

// ─── Utility exports ──────────────────────────────────────────────────────────

export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    const data = await getSpotifyAlbum(albumId);
    return data.tracks.items;
}

export async function getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const data = await getSpotifyPlaylist(playlistId);
    return data.tracks.items.map((item: any) => item.track).filter(Boolean);
}

export function buildYouTubeSearchQuery(track: SpotifyTrack): string {
    const artists = track.artists.map(a => a.name).join(' ');
    return `${track.name} ${artists} audio`;
}

export function getHighQualityThumbnail(track: SpotifyTrack): string {
    return track.album?.images?.[0]?.url || '';
}

export function formatTrackMetadata(track: SpotifyTrack) {
    return {
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album?.name || 'Unknown',
        releaseDate: track.album?.release_date || '',
        duration: Math.floor(track.duration_ms / 1000),
        thumbnail: getHighQualityThumbnail(track),
        trackNumber: track.track_number,
        explicit: track.explicit,
        spotifyUrl: track.external_urls?.spotify || '',
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
