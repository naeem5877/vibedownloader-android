/**
 * Design System - Premium Advanced Theme
 * Updated to match the app logo: Purple/Blue gradient with Orange accent
 */

export const Colors = {
    // Brand - Logo-Inspired Vibrant Palette
    primary: '#6366F1', // Vibrant Purple from logo
    primaryLight: '#818CF8',
    primaryDark: '#4338CA',
    secondary: '#3B82F6', // Blue from logo gradient
    secondaryLight: '#60A5FA',
    secondaryDark: '#2563EB',
    accent: '#F97316', // Orange accent from logo

    // Background - Deep Pure Blacks
    background: '#010101', // Pure Black
    backgroundGradientStart: '#000000',
    backgroundGradientEnd: '#161616',

    // Surfaces - Dark and Sleek
    surface: '#121212', // Slightly lighter black for cards
    surfaceElevated: '#1E1E1E', // Modals
    surfaceHover: '#2A2A2A',
    surfaceGlass: 'rgba(18, 18, 24, 0.85)', // Glassmorphism
    surfaceGlassLight: 'rgba(255, 255, 255, 0.05)',

    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#EBEBEB',
    textMuted: '#8F8F8F',
    textAccent: '#F97316', // Orange text for accents

    // Status
    success: '#00E676',
    successLight: '#69F0AE',
    error: '#EF4444', // Red for errors
    errorLight: '#F87171',
    warning: '#FFEA00',
    warningLight: '#FFFF00',
    info: '#3B82F6',
    infoLight: '#60A5FA',

    // UI
    border: '#2F2F2F',
    borderLight: '#3D3D3D',
    borderAccent: 'rgba(99, 102, 241, 0.4)', // Purple border
    overlay: 'rgba(0, 0, 0, 0.9)',
    overlayLight: 'rgba(0, 0, 0, 0.7)',

    // Gradients Colors (matching logo)
    gradientPurple: '#6366F1',
    gradientBlue: '#3B82F6',
    gradientIndigo: '#4F46E5',
    gradientOrange: '#F97316',

    // Platforms - Dynamic Theming
    youtube: '#FF0000', // RED for YouTube
    instagram: '#E1306C',
    facebook: '#1877F2',
    tiktok: '#00F2EA', // CYAN for TikTok
    spotify: '#1DB954',
    x: '#FFFFFF',
    pinterest: '#BD081C',
    soundcloud: '#FF5500',
};

export const PlatformThemes: Record<string, {
    primary: string,
    background: string,
    surface: string,
    gradient: string[]
}> = {
    YouTube: {
        primary: '#FF0000', // Red
        background: '#0A0A0C',
        surface: '#1A1010',
        gradient: ['#FF0000', '#CC0000'],
    },
    Instagram: {
        primary: '#E1306C',
        background: '#0C080A',
        surface: '#1A0F14',
        gradient: ['#F77737', '#E1306C', '#C13584', '#833AB4'],
    },
    Facebook: {
        primary: '#1877F2',
        background: '#080A0F',
        surface: '#0F1520',
        gradient: ['#1877F2', '#0C5DC7'],
    },
    TikTok: {
        primary: '#00F2EA', // Cyan
        background: Colors.background,
        surface: Colors.surface,
        gradient: ['#00F2EA', '#FF0050'],
    },
    Spotify: {
        primary: '#1DB954',
        background: Colors.background,
        surface: Colors.surface,
        gradient: ['#1DB954', '#169C46'],
    },
    X: {
        primary: '#1DA1F2',
        background: Colors.background,
        surface: Colors.surface,
        gradient: ['#1DA1F2', '#0C85D0'],
    },
    Pinterest: {
        primary: '#BD081C',
        background: Colors.background,
        surface: Colors.surface,
        gradient: ['#BD081C', '#9C0617'],
    },
    SoundCloud: {
        primary: '#FF5500',
        background: Colors.background,
        surface: Colors.surface,
        gradient: ['#FF8800', '#FF5500'],
    },
    default: {
        primary: Colors.primary,
        background: Colors.background,
        surface: Colors.surface,
        gradient: [Colors.primary, Colors.secondary], // Purple to blue like logo
    }
};

export const Spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
};

export const BorderRadius = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    round: 9999,
};

export const Typography = {
    sizes: {
        xxs: 10,
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
        '5xl': 48,
    },
    weights: {
        light: '300',
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
    } as const,
    letterSpacing: {
        tight: -0.5,
        normal: 0,
        wide: 0.5,
        wider: 1,
        widest: 2,
    }
};

export const Shadows = {
    none: {},
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
        shadowRadius: 6,
        elevation: 6,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 12,
    },
    xl: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 20,
    },
    glow: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    }),
    glowSm: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    }),
};

export const SUPPORTED_PLATFORMS = [
    { id: 'YouTube', color: Colors.youtube, label: 'YouTube' },
    { id: 'Instagram', color: Colors.instagram, label: 'Instagram' },
    { id: 'Facebook', color: Colors.facebook, label: 'Facebook' },
    { id: 'TikTok', color: Colors.tiktok, label: 'TikTok' },
    { id: 'Spotify', color: Colors.spotify, label: 'Spotify' },
    { id: 'X', color: Colors.x, label: 'X' },
    { id: 'Pinterest', color: Colors.pinterest, label: 'Pinterest' },
    { id: 'SoundCloud', color: Colors.soundcloud, label: 'SoundCloud' },
];

export const getPlatformColor = (platform: string | null | undefined): string => {
    if (!platform) return Colors.primary;
    const found = SUPPORTED_PLATFORMS.find(
        p => p.id.toLowerCase() === platform.toLowerCase()
    );
    return found?.color || Colors.primary;
};

export const Animations = {
    timing: {
        fast: 150,
        normal: 300,
        slow: 500,
        verySlow: 800,
    },
    spring: {
        gentle: { damping: 20, stiffness: 100 },
        bouncy: { damping: 10, stiffness: 150 },
        stiff: { damping: 30, stiffness: 200 },
    }
};
