export const detectPlatform = (url: string): string => {
    if (!url) return 'YouTube';
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) return 'Instagram';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'Facebook';
    if (lowerUrl.includes('tiktok.com')) return 'TikTok';
    if (lowerUrl.includes('spotify.com')) return 'Spotify';
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'X';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'Pinterest';
if (lowerUrl.includes('soundcloud.com')) return 'SoundCloud';
  // clips.twitch.tv is checked first only for readability; both forms share the
  // twitch.tv host, so a single substring test covers VODs, channels and clips.
  if (lowerUrl.includes('twitch.tv')) return 'Twitch';
  if (lowerUrl.includes('youtu.be') || lowerUrl.includes('youtube.com')) return 'YouTube';

    return 'YouTube'; // Default/Fallback
};
