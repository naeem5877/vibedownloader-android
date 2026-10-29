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

// ─── Constants ─────────────────────────────────────────────────────────────────

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];
const UA = USER_AGENTS[0];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function decodeHTMLEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function getOGMeta(html: string, prop: string): string | null {
    const m =
        html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i')) ||
        html.match(new RegExp(`<meta content="([^"]*)" property="${prop}"`, 'i'));
    return m ? decodeHTMLEntities(m[1]) : null;
}

// ─── extractSpotifyId ──────────────────────────────────────────────────────────

export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    const match = url.match(/spotify\.com\/(?:[a-z]{2}-[a-z]{2}\/|intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
        return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
}

// ─── Method 1: oEmbed ─────────────────────────────────────────────────────────
// NOTE: Spotify removed author_name from oEmbed in 2024/2025.
// oEmbed is now only used for title + thumbnail_url.

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

// ─── Method 2: Embed page __NEXT_DATA__ ───────────────────────────────────────
// Confirmed working 2025. Live API entity shape:
//   entity.name                   → track title (string)
//   entity.artists[]              → [{ name, uri }]  ← flat array, NOT .profile.name
//   entity.visualIdentity.image[] → [{ url, maxWidth, maxHeight }]
//   entity.duration               → ms (direct number)
//   entity.isExplicit             → boolean
//   entity.audioPreview.url       → preview mp3 URL
//   entity.releaseDate.isoString  → "2022-10-21T00:00:00Z"

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

        // Use indexOf — avoids regex multiline issues in the Hermes JS engine
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
            console.warn('[Spotify:Embed] Entity not found or wrong type:', entity?.type);
            console.warn('[Spotify:Embed] state.data keys:', Object.keys(pageProps?.state?.data || {}));
            console.warn('[Spotify:Embed] pageProps (800 chars):', JSON.stringify(pageProps).slice(0, 800));
            return null;
        }

        console.log('[Spotify:Embed] Entity OK → name:', entity.name);

        // Artists: confirmed FLAT array { name, uri } — no .profile.name
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
        console.log('[Spotify:Embed] Images:', images.length);

        // Fall back to oEmbed thumbnail if embed returned none
        if (images.length === 0 && oembedThumbnail) {
            images = [{ url: oembedThumbnail, height: 640, width: 640 }];
        }

        const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
        return {
            id: entity.id || trackId,
            name: entity.name || entity.title || 'Unknown Track',
            artists: artists.length > 0 ? artists : [{ id: '', name: 'Unknown Artist', external_urls: { spotify: '' } }],
            album: {
                id: '',
                name: entity.name || 'Unknown Album', // album not included in embed entity
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

// ─── Method 3: OG tag scraping ────────────────────────────────────────────────

async function tryOGFallback(url: string, type: 'track' | 'album' | 'playlist'): Promise<any> {
    console.log('[Spotify:OG] →', url);
    let html = '';
    for (const ua of USER_AGENTS) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
            });
            console.log('[Spotify:OG] Status:', res.status);
            if (res.ok) { html = await res.text(); break; }
        } catch (e: any) {
            console.warn('[Spotify:OG] Fetch error:', e?.message);
        }
    }
    if (!html) throw new Error('OG fallback: all requests failed');

    const title = getOGMeta(html, 'og:title') || 'Unknown Title';
    const image = getOGMeta(html, 'og:image') || '';
    const desc = getOGMeta(html, 'og:description') || '';
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

// ─── getTrackInfo ─────────────────────────────────────────────────────────────

/**
 * Get Spotify track metadata.
 * Chain: oEmbed (title+thumbnail) → Embed page __NEXT_DATA__ → OG tag fallback
 */
export async function getTrackInfo(trackId: string): Promise<SpotifyTrack> {
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    console.log('[Spotify] ─── getTrackInfo ───', trackId);

    // 1. oEmbed — title + thumbnail only (author_name removed by Spotify)
    const oembed = await tryOEmbed(spotifyUrl);
    console.log('[Spotify] oEmbed:', oembed ? `"${oembed.title}"` : 'null');

    // 2. Embed page — primary source with full artist/image data
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

// ─── getSpotifyPlaylist ───────────────────────────────────────────────────────
// ─── Embed pages (playlist / album) ───────────────────────────────────────────
// open.spotify.com/playlist/<id> is a client-rendered app with no __NEXT_DATA__,
// so scraping it finds nothing and the sheet used to open with 0 tracks. The
// embed player page still ships the track list as __NEXT_DATA__ JSON:
//   entity.name / entity.title      → playlist or album name
//   entity.subtitle                 → owner (playlist) or artist (album)
//   entity.visualIdentity.image[]   → cover art [{ url, maxWidth, maxHeight }]
//   entity.trackList[]              → { uri, title, subtitle (artists, comma
//                                      separated), duration (ms), isExplicit,
//                                      audioPreview, entityType }
// Limits: Spotify caps the embed list at 100 tracks, and playlist tracks carry
// no album art of their own (see fetchTrackThumbnails).

/** Spotify's embed endpoint never returns more than this many tracks per playlist. */
export const SPOTIFY_EMBED_TRACK_LIMIT = 100;

type EmbedImage = { url: string; height: number; width: number };

async function fetchEmbedEntity(kind: 'playlist' | 'album', id: string): Promise<any | null> {
    const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`;
    for (const ua of USER_AGENTS) {
        try {
            const res = await fetch(embedUrl, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            console.log(`[Spotify:Embed:${kind}] Status:`, res.status);
            if (!res.ok) continue;

            const html = await res.text();
            const tagIdx = html.indexOf('__NEXT_DATA__');
            if (tagIdx === -1) {
                console.warn(`[Spotify:Embed:${kind}] __NEXT_DATA__ NOT found`);
                continue;
            }
            const jsonStart = html.indexOf('>', tagIdx) + 1;
            const jsonEnd = html.indexOf('</script>', jsonStart);
            const pageProps = JSON.parse(html.slice(jsonStart, jsonEnd))?.props?.pageProps;
            const entity = pageProps?.state?.data?.entity;
            if (entity && Array.isArray(entity.trackList)) return entity;

            // Private, deleted or region-locked: Spotify answers 200 with a 404 status inside the JSON.
            console.warn(`[Spotify:Embed:${kind}] No entity, page status:`, pageProps?.status);
            return null;
        } catch (e: any) {
            console.warn(`[Spotify:Embed:${kind}] Exception:`, e?.message);
        }
    }
    return null;
}

/** Cover images, largest first. */
function embedImages(entity: any): EmbedImage[] {
    const raw: any[] = entity?.visualIdentity?.image || [];
    return raw
        .filter(img => !!img?.url)
        .sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))
        .map(img => ({ url: img.url, height: img.maxHeight || 640, width: img.maxWidth || 640 }));
}

function embedTracks(
    entity: any,
    albumName: string,
    albumImages: EmbedImage[],
    releaseDate: string,
): SpotifyTrack[] {
    const out: SpotifyTrack[] = [];
    (entity.trackList as any[]).forEach((t: any, idx: number) => {
        if (t?.entityType && t.entityType !== 'track') return; // podcast episodes etc.
        const id = String(t?.uri || '').split(':').pop() || '';
        const title = String(t?.title || '').trim();
        if (!id || !title) return;

        const artistNames = String(t.subtitle || '')
            .replace(/ /g, ' ')
            .split(/\s*,\s*/)
            .map(s => s.trim())
            .filter(Boolean);

        out.push({
            id,
            name: title,
            artists: (artistNames.length ? artistNames : ['Unknown Artist']).map(name => ({
                id: '',
                name,
                external_urls: { spotify: '' },
            })),
            album: { id: '', name: albumName, images: albumImages, release_date: releaseDate, total_tracks: 0 },
            duration_ms: Number(t.duration) || 0,
            explicit: !!t.isExplicit,
            preview_url: t.audioPreview?.url || null,
            external_urls: { spotify: `https://open.spotify.com/track/${id}` },
            track_number: idx + 1,
        });
    });
    return out;
}

const UNREADABLE_MESSAGE =
    'Could not read this Spotify link. It may be private or unavailable, or check your connection.';

// ─── getSpotifyPlaylist ───────────────────────────────────────────────────────

export async function getSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    console.log('[Spotify] ─── getSpotifyPlaylist ───', playlistId);
    const entity = await fetchEmbedEntity('playlist', playlistId);
    if (entity) {
        // Playlist tracks have no album name or art in the embed list; the
        // sheet fills art in afterwards and the downloader falls back to "Unknown".
        const tracks = embedTracks(entity, '', [], '');
        if (tracks.length > 0) {
            console.log('[Spotify:Playlist] ✅ Embed OK →', entity.name, '|', tracks.length, 'tracks');
            return {
                id: playlistId,
                name: entity.name || entity.title || 'Spotify Playlist',
                description: '',
                images: embedImages(entity).map(img => ({ url: img.url })),
                owner: { display_name: entity.subtitle || 'Spotify' },
                tracks: { total: tracks.length, items: tracks.map(track => ({ track })) },
            };
        }
    }
    console.error('[Spotify] ❌ Playlist fetch failed:', playlistId);
    throw new Error(UNREADABLE_MESSAGE);
}

// ─── getSpotifyAlbum ──────────────────────────────────────────────────────────

export async function getSpotifyAlbum(albumId: string): Promise<any> {
    console.log('[Spotify] ─── getSpotifyAlbum ───', albumId);
    const entity = await fetchEmbedEntity('album', albumId);
    if (entity) {
        const images = embedImages(entity);
        const name = entity.name || entity.title || 'Spotify Album';
        const releaseDate = entity.releaseDate?.isoString?.split('T')[0] || '';
        const tracks = embedTracks(entity, name, images, releaseDate);
        if (tracks.length > 0) {
            console.log('[Spotify:Album] ✅ Embed OK →', name, '|', tracks.length, 'tracks');
            return {
                id: albumId,
                name,
                images,
                release_date: releaseDate,
                total_tracks: tracks.length,
                tracks: { items: tracks },
            };
        }
    }
    console.error('[Spotify] ❌ Album fetch failed:', albumId);
    throw new Error(UNREADABLE_MESSAGE);
}

// ─── Per-track album art ──────────────────────────────────────────────────────
// oEmbed returns the track's album cover (300x300). One request per track, so
// callers get results in small batches and can cancel between them.

async function fetchTrackThumbnail(trackId: string): Promise<string | null> {
    try {
        const trackUrl = `https://open.spotify.com/track/${trackId}`;
        const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`, {
            headers: { 'User-Agent': UA },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.thumbnail_url || null;
    } catch {
        return null;
    }
}

export async function fetchTrackThumbnails(
    trackIds: string[],
    onBatch: (found: Record<string, string>) => void,
    shouldCancel: () => boolean = () => false,
    batchSize: number = 8,
): Promise<void> {
    for (let i = 0; i < trackIds.length; i += batchSize) {
        if (shouldCancel()) return;
        const slice = trackIds.slice(i, i + batchSize);
        const urls = await Promise.all(slice.map(fetchTrackThumbnail));
        if (shouldCancel()) return;
        const found: Record<string, string> = {};
        urls.forEach((url, idx) => {
            if (url) found[slice[idx]] = url;
        });
        if (Object.keys(found).length > 0) onBatch(found);
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
    const cleanTrackName = track.name.replace(/"/g, '');
    const cleanArtists = track.artists.map(a => a.name.replace(/"/g, '')).join(' ');
    // Append "official audio" or "Topic" to ensure we get the original song
    // instead of music videos with long intros, fan covers, or lyrics videos.
    return `"${cleanTrackName}" "${cleanArtists}" (official audio OR topic)`;
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