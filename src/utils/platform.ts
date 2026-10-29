/** Host part of an http(s) URL, lowercased, or '' when there isn't one. */
const hostOf = (url: string): string => {
    const m = url.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
    return m ? m[1].toLowerCase().replace(/^.*@/, '').replace(/:\d+$/, '') : '';
};

const hostIs = (host: string, domain: string): boolean =>
    host === domain || host.endsWith(`.${domain}`);

/**
 * Which platform a URL belongs to, or `null` when it is not one we recognise.
 *
 * Callers that auto-switch the platform picker must use this, not
 * [detectPlatform]: that one falls back to 'YouTube' for anything unknown, so
 * "it said YouTube" cannot tell a real YouTube link from a random one.
 */
export const matchPlatform = (url: string): string | null => {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();
    const host = hostOf(url);

    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) return 'Instagram';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'Facebook';
    if (lowerUrl.includes('tiktok.com')) return 'TikTok';
    if (lowerUrl.includes('spotify.com')) return 'Spotify';
    // Host match, not a substring one: "x.com" is also the tail of netflix.com.
    if (hostIs(host, 'twitter.com') || hostIs(host, 'x.com')) return 'X';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'Pinterest';
    if (lowerUrl.includes('soundcloud.com')) return 'SoundCloud';
    // clips.twitch.tv is checked first only for readability; both forms share the
    // twitch.tv host, so a single substring test covers VODs, channels and clips.
    if (lowerUrl.includes('twitch.tv')) return 'Twitch';
    if (lowerUrl.includes('youtu.be') || lowerUrl.includes('youtube.com')) return 'YouTube';

    return null;
};

export const detectPlatform = (url: string): string =>
    matchPlatform(url) ?? 'YouTube'; // Default/Fallback
