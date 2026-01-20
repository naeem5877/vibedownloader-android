/**
 * Design System - Premium Advanced Theme
 */

export const Colors = {
    // Brand - Vibrant gradient-inspired palette
    primary: '#FF0050', // Hot Pink
    primaryLight: '#FF4081',
    primaryDark: '#C51162',
    secondary: '#00F2EA', // Cyan accent
    secondaryLight: '#64FFDA',
    secondaryDark: '#00BFA5',
    accent: '#7C4DFF', // Purple accent
    accentLight: '#B388FF',

    // Background - Deep premium blacks
    background: '#0A0A0C', // Near-black with blue tint
    backgroundGradientStart: '#0F0F12',
    backgroundGradientEnd: '#0A0A0C',

    // Surfaces - Glassmorphism ready
    surface: '#16161A', // Card background
    surfaceElevated: '#1E1E24', // Modal/Dropdown
    surfaceHover: '#252530',
    surfaceGlass: 'rgba(30, 30, 40, 0.7)', // Glassmorphism
    surfaceGlassLight: 'rgba(40, 40, 55, 0.5)',

    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    textAccent: '#FF0050',

    // Status
    success: '#10B981',
    successLight: '#34D399',
    error: '#EF4444',
    errorLight: '#F87171',
    warning: '#F59E0B',
    warningLight: '#FBBF24',
    info: '#3B82F6',
    infoLight: '#60A5FA',

    // UI
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.12)',
    borderAccent: 'rgba(255, 0, 80, 0.3)',
    overlay: 'rgba(0, 0, 0, 0.85)',
    overlayLight: 'rgba(0, 0, 0, 0.5)',

    // Gradients Colors
    gradientPink: '#FF0050',
    gradientPurple: '#7C4DFF',
    gradientCyan: '#00F2EA',
    gradientOrange: '#FF6B35',

    // Platforms - Dynamic Theming
    youtube: '#FF0000',
    instagram: '#E1306C',
    facebook: '#1877F2',
    tiktok: '#FE2C55',
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
        primary: '#FF0000',
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
        primary: '#FE2C55',
        background: '#0A0A0C',
        surface: '#1A1014',
        gradient: ['#25F4EE', '#FE2C55'],
    },
    Spotify: {
        primary: '#1DB954',
        background: '#080C08',
        surface: '#0F180F',
        gradient: ['#1DB954', '#169C46'],
    },
    X: {
        primary: '#1DA1F2',
        background: '#080A0F',
        surface: '#0F1520',
        gradient: ['#1DA1F2', '#0C85D0'],
    },
    Pinterest: {
        primary: '#BD081C',
        background: '#0C0808',
        surface: '#180F0F',
        gradient: ['#BD081C', '#9C0617'],
    },
    SoundCloud: {
        primary: '#FF5500',
        background: '#0C0A08',
        surface: '#1A140F',
        gradient: ['#FF8800', '#FF5500'],
    },
    default: {
        primary: '#FF0050',
        background: '#0A0A0C',
        surface: '#16161A',
        gradient: ['#FF0050', '#7C4DFF'],
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
