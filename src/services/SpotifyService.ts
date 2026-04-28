import { Buffer } from 'buffer';

// Ensure Buffer is globally available for libraries that expect it
if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];

/**
 * Fetch HTML from a Spotify URL, trying multiple User-Agents until one succeeds.
 */
async function fetchSpotifyHtml(url: string): Promise<string> {
    let lastError: any = null;
    for (const ua of USER_AGENTS) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                },
            });
            if (response.ok) {
                return await response.text();
            }
            lastError = new Error(`HTTP ${response.status}`);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError ?? new Error('All UA attempts failed');
}

/**
 * PRIMARY METHOD: Parse Spotify's embedded __NEXT_DATA__ JSON blob.
 * This contains full track/album/playlist metadata without any API key.
 */
function parseNextData(html: string): any | null {
    try {
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return null;
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

/**
 * Extract og: meta tag value from HTML string.
 */
function getOGMeta(html: string, prop: string): string | null {
    const match =
        html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i')) ||
        html.match(new RegExp(`<meta content="([^"]*)" property="${prop}"`, 'i'));
    return match ? decodeHTMLEntities(match[1]) : null;
}

function decodeHTMLEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract Spotify content type and ID from a URL.
 * Handles locale segments like /intl-pt/ or /en-US/.
 */
export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    const match = url.match(
        /spotify\.com\/(?:[a-z]{2}-[a-z]{2}\/|intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/
    );
    if (match) {
        return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

/**
 * Fetch full track metadata from Spotify.
 * Strategy: __NEXT_DATA__ → oEmbed + OG tags fallback
 */
export async function getTrackInfo(trackId: string): Promise<SpotifyTrack> {
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;

    // ── Strategy 1: __NEXT_DATA__ (most reliable, richest data) ──────────────
    try {
        const html = await fetchSpotifyHtml(spotifyUrl);
        const nextData = parseNextData(html);

        if (nextData) {
            // Path differs by Spotify's Next.js version; try both known paths
            const entity =
                nextData?.props?.pageProps?.state?.data?.entity ||
                nextData?.props?.pageProps?.track ||
                nextData?.props?.pageProps?.data?.track;

            if (entity && entity.name) {
                const artists: SpotifyArtist[] = (entity.artists?.items || entity.artists || []).map((a: any) => ({
                    id: a.id || a.uri?.split(':').pop() || '',
                    name: a.profile?.name || a.name || 'Unknown Artist',
                    external_urls: { spotify: `https://open.spotify.com/artist/${a.id || ''}` },
                }));

                const albumData = entity.albumOfTrack || entity.album || {};
                const albumImages: { url: string; height: number; width: number }[] =
                    (albumData.coverArt?.sources || albumData.images || []).map((img: any) => ({
                        url: img.url || '',
                        height: img.height || 640,
                        width: img.width || 640,
                    }));

                return {
                    id: trackId,
                    name: entity.name,
                    artists: artists.length > 0 ? artists : [{ id: '', name: 'Unknown Artist', external_urls: { spotify: '' } }],
                    album: {
                        id: albumData.id || albumData.uri?.split(':').pop() || '',
                        name: albumData.name || 'Unknown Album',
                        images: albumImages,
                        release_date: albumData.date?.isoString || albumData.release_date || '',
                        total_tracks: albumData.tracks?.totalCount || albumData.total_tracks || 1,
                    },
                    duration_ms: entity.duration?.totalMilliseconds || entity.duration_ms || 0,
                    explicit: entity.contentRating?.label === 'EXPLICIT' || entity.explicit || false,
                    preview_url: entity.preview_url || null,
                    external_urls: { spotify: spotifyUrl },
                    track_number: entity.trackNumber || entity.track_number || 1,
                };
            }
        }

        // ── Strategy 2: oEmbed + OG tags from the already-fetched HTML ──────
        console.warn('[SpotifyService] __NEXT_DATA__ parse failed, trying oEmbed...');
        return await getTrackInfoViaOEmbed(trackId, spotifyUrl, html);
    } catch (e) {
        console.warn('[SpotifyService] HTML fetch failed, falling back to oEmbed only...', e);
        return await getTrackInfoViaOEmbed(trackId, spotifyUrl, null);
    }
}

async function getTrackInfoViaOEmbed(
    trackId: string,
    spotifyUrl: string,
    existingHtml: string | null
): Promise<SpotifyTrack> {
    let artistName = 'Unknown Artist';
    let trackName = 'Unknown Track';
    let albumName = 'Unknown Album';
    let thumbnailUrl = '';

    // oEmbed gives us title = "Track Name" and author_name = "Artist Name"
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const res = await fetch(oembedUrl, {
            headers: { 'User-Agent': USER_AGENTS[0] },
        });
        if (res.ok) {
            const data = await res.json();
            // oEmbed title format is usually "Track Name" (just the track)
            trackName = data.title || trackName;
            // author_name is the artist — this is reliable!
            artistName = data.author_name || artistName;
            thumbnailUrl = data.thumbnail_url || thumbnailUrl;
        }
    } catch (e) {
        console.warn('[SpotifyService] oEmbed failed:', e);
    }

    // OG tags can give us album name from description ("Artist · Song · Album · Year")
    try {
        const html = existingHtml ?? await fetchSpotifyHtml(spotifyUrl);
        const ogDesc = getOGMeta(html, 'og:description') || '';
        const ogImage = getOGMeta(html, 'og:image') || '';
        const ogTitle = getOGMeta(html, 'og:title') || '';

        if (ogImage) thumbnailUrl = ogImage;

        // OG description format: "Artist · Song · Album"  or  "Song · Album · Year"
        const parts = ogDesc.split(' · ').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 3) {
            // Artist is first, album is usually last or second-to-last
            artistName = parts[0] !== trackName ? parts[0] : artistName;
            albumName = parts[parts.length - 1] || albumName;
        } else if (parts.length === 2) {
            albumName = parts[1] || albumName;
        }

        // og:title is "Track Name - Artist Name" on some pages
        if (ogTitle && ogTitle.includes(' - ')) {
            const [t, a] = ogTitle.split(' - ');
            if (!trackName || trackName === 'Unknown Track') trackName = t.trim();
            if (!artistName || artistName === 'Unknown Artist') artistName = a.trim();
        }
    } catch (e) {
        console.warn('[SpotifyService] OG fallback failed:', e);
    }

    return {
        id: trackId,
        name: trackName,
        artists: [{ id: '', name: artistName, external_urls: { spotify: '' } }],
        album: {
            id: '',
            name: albumName,
            images: [{ url: thumbnailUrl, height: 640, width: 640 }],
            release_date: '',
            total_tracks: 1,
        },
        duration_ms: 0,
        explicit: false,
        preview_url: null,
        external_urls: { spotify: spotifyUrl },
        track_number: 1,
    };
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

export async function getSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;

    try {
        const html = await fetchSpotifyHtml(spotifyUrl);
        const nextData = parseNextData(html);

        if (nextData) {
            const playlist =
                nextData?.props?.pageProps?.state?.data?.entity ||
                nextData?.props?.pageProps?.playlist ||
                nextData?.props?.pageProps?.data?.playlist;

            if (playlist?.name) {
                const images =
                    (playlist.images?.items || playlist.images || []).map((img: any) => ({
                        url: img?.sources?.[0]?.url || img?.url || '',
                    }));

                return {
                    id: playlistId,
                    name: playlist.name,
                    description: playlist.description || '',
                    images,
                    owner: { display_name: playlist.ownerV2?.data?.name || playlist.owner?.display_name || 'Spotify' },
                    tracks: {
                        total: playlist.tracks?.totalCount || playlist.tracks?.total || 0,
                        items: (playlist.tracks?.items || []).map((item: any) => ({
                            track: item.itemV2?.data || item.track,
                        })),
                    },
                };
            }
        }

        // Fallback to oEmbed + OG
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const oRes = await fetch(oembedUrl, { headers: { 'User-Agent': USER_AGENTS[0] } });
        const oData = oRes.ok ? await oRes.json() : null;

        return {
            id: playlistId,
            name: oData?.title || getOGMeta(html, 'og:title') || 'Spotify Playlist',
            description: getOGMeta(html, 'og:description') || '',
            images: [{ url: oData?.thumbnail_url || getOGMeta(html, 'og:image') || '' }],
            owner: { display_name: oData?.author_name || 'Spotify' },
            tracks: { total: 0, items: [] },
        };
    } catch (e) {
        throw new Error('Failed to fetch playlist from Spotify: ' + String(e));
    }
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

export async function getSpotifyAlbum(albumId: string): Promise<any> {
    const spotifyUrl = `https://open.spotify.com/album/${albumId}`;

    try {
        const html = await fetchSpotifyHtml(spotifyUrl);
        const nextData = parseNextData(html);

        if (nextData) {
            const album =
                nextData?.props?.pageProps?.state?.data?.entity ||
                nextData?.props?.pageProps?.album ||
                nextData?.props?.pageProps?.data?.album;

            if (album?.name) {
                const images =
                    (album.coverArt?.sources || album.images || []).map((img: any) => ({
                        url: img.url || '',
                        height: img.height || 640,
                        width: img.width || 640,
                    }));

                const tracks: SpotifyTrack[] = (album.tracks?.items || []).map((item: any) => {
                    const t = item.track || item;
                    const artists: SpotifyArtist[] = (t.artists?.items || t.artists || []).map((a: any) => ({
                        id: a.id || '',
                        name: a.profile?.name || a.name || 'Unknown Artist',
                        external_urls: { spotify: '' },
                    }));
                    return {
                        id: t.id || t.uri?.split(':').pop() || '',
                        name: t.name || 'Unknown Track',
                        artists,
                        album: {
                            id: albumId,
                            name: album.name,
                            images,
                            release_date: album.date?.isoString || '',
                            total_tracks: album.tracks?.totalCount || 0,
                        },
                        duration_ms: t.duration?.totalMilliseconds || 0,
                        explicit: t.contentRating?.label === 'EXPLICIT' || false,
                        preview_url: null,
                        external_urls: { spotify: `https://open.spotify.com/track/${t.id || ''}` },
                        track_number: t.trackNumber || 0,
                    };
                });

                return {
                    id: albumId,
                    name: album.name,
                    images,
                    release_date: album.date?.isoString || '',
                    total_tracks: album.tracks?.totalCount || tracks.length,
                    tracks: { items: tracks },
                };
            }
        }

        // Fallback
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const oRes = await fetch(oembedUrl, { headers: { 'User-Agent': USER_AGENTS[0] } });
        const oData = oRes.ok ? await oRes.json() : null;

        return {
            id: albumId,
            name: oData?.title || getOGMeta(html, 'og:title') || 'Spotify Album',
            images: [{ url: oData?.thumbnail_url || getOGMeta(html, 'og:image') || '' }],
            release_date: '',
            total_tracks: 0,
            tracks: { items: [] },
        };
    } catch (e) {
        throw new Error('Failed to fetch album from Spotify: ' + String(e));
    }
}

// ---------------------------------------------------------------------------
// Helpers (unchanged public API)
// ---------------------------------------------------------------------------

export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    const albumData = await getSpotifyAlbum(albumId);
    return albumData.tracks.items;
}

export async function getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const data = await getSpotifyPlaylist(playlistId);
    return data.tracks.items.map((item: any) => item.track).filter(Boolean);
}

/**
 * Build YouTube search query from Spotify track.
 * Uses all artists + track name for accuracy.
 */
export function buildYouTubeSearchQuery(track: SpotifyTrack): string {
    const artists = track.artists.map(a => a.name).join(' ');
    return `${track.name} ${artists} official audio`;
}

export function getHighQualityThumbnail(track: SpotifyTrack): string {
    const images = track.album?.images || [];
    if (images.length === 0) return '';
    return images[0].url;
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