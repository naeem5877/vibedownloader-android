/**
 * VibeDownloader Mobile - Theme & Design System
 */

export const Colors = {
    // Background
    background: '#0a0a0b',
    surface: '#111113',
    surfaceElevated: '#18181b',
    surfaceHover: '#1f1f24',

    // Primary (accent)
    primary: '#ff0050', // YouTube red-ish
    primaryGlow: 'rgba(255, 0, 80, 0.3)',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',

    // Borders
    border: '#27272a',
    borderLight: '#3f3f46',

    // Status
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',

    // Platform colors
    youtube: '#ff0000',
    instagram: '#E4405F',
    facebook: '#1877F2',
    tiktok: '#000000',
    spotify: '#1DB954',
    twitter: '#000000',
    pinterest: '#BD081C',
    soundcloud: '#ff5500',

    // Gradients (as array for LinearGradient)
    gradientPrimary: ['#ff0050', '#ff4d4d'],
    gradientDark: ['#0a0a0b', '#18181b'],
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
};

export const Typography = {
    // Sizes
    sizes: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
    },
    // Weights
    weights: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
    },
};

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    glow: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    }),
};

export const SUPPORTED_PLATFORMS = [
    { id: 'youtube', name: 'YouTube', color: Colors.youtube, icon: 'youtube' },
    { id: 'instagram', name: 'Instagram', color: Colors.instagram, icon: 'instagram' },
    { id: 'tiktok', name: 'TikTok', color: Colors.tiktok, icon: 'tiktok' },
    { id: 'facebook', name: 'Facebook', color: Colors.facebook, icon: 'facebook' },
    { id: 'spotify', name: 'Spotify', color: Colors.spotify, icon: 'spotify' },
    { id: 'twitter', name: 'X', color: Colors.twitter, icon: 'twitter' },
    { id: 'pinterest', name: 'Pinterest', color: Colors.pinterest, icon: 'pinterest' },
    { id: 'soundcloud', name: 'SoundCloud', color: Colors.soundcloud, icon: 'soundcloud' },
] as const;

export type PlatformId = typeof SUPPORTED_PLATFORMS[number]['id'];

export const getPlatformById = (id: string) =>
    SUPPORTED_PLATFORMS.find(p => p.id === id);

export const getPlatformColor = (platform: string): string => {
    const p = platform.toLowerCase();
    if (p.includes('youtube')) return Colors.youtube;
    if (p.includes('instagram')) return Colors.instagram;
    if (p.includes('facebook')) return Colors.facebook;
    if (p.includes('tiktok')) return Colors.tiktok;
    if (p.includes('spotify')) return Colors.spotify;
    if (p.includes('twitter') || p === 'x') return Colors.twitter;
    if (p.includes('pinterest')) return Colors.pinterest;
    if (p.includes('soundcloud')) return Colors.soundcloud;
    return Colors.primary;
};
