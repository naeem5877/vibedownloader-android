// @ts-nocheck
import { MD3DarkTheme as PaperDarkTheme, MD3LightTheme as PaperLightTheme, configureFonts } from 'react-native-paper';

// Custom Typography if needed, otherwise defaults are good for MD3
const fontConfig = {
    fontFamily: 'System',
};

// VibeDownloader Custom Colors (monochrome: white on black)
const vibeColors = {
    primary: '#FFFFFF',
    onPrimary: '#000000',
    primaryContainer: '#27272A', // Neutral dark chip / pill
    onPrimaryContainer: '#FFFFFF',

    secondary: '#E4E4E7',
    onSecondary: '#000000',
    secondaryContainer: '#27272A',
    onSecondaryContainer: '#F4F4F5',

    tertiary: '#D4D4D8',
    onTertiary: '#000000',
    tertiaryContainer: '#27272A',
    onTertiaryContainer: '#F4F4F5',

    error: '#EF4444',
    onError: '#FFFFFF',
    errorContainer: '#7F1D1D',
    onErrorContainer: '#FEE2E2',

    background: '#010101', // Pure Black
    onBackground: '#EBEBEB',

    surface: '#121212', // Material Surface
    onSurface: '#EBEBEB',
    surfaceVariant: '#1E1E1E', // Slightly lighter for cards
    onSurfaceVariant: '#CAC4D0',

    outline: '#49454F',
    outlineVariant: '#2F2F2F',

    elevation: {
        level0: 'transparent',
        level1: '#1E1E1E',
        level2: '#232323',
        level3: '#252525',
        level4: '#272727',
        level5: '#2A2A2A',
    }
};

export const AppTheme = {
    ...PaperDarkTheme,
    colors: {
        ...PaperDarkTheme.colors,
        ...vibeColors,
        // Ensure elevation colors are set if using elevation
        elevation: vibeColors.elevation,
    },
    // Roundness for cards/buttons
    roundness: 12,
};

// Exporting a light theme just in case, but focussing on Dark
export const AppThemeLight = {
    ...PaperLightTheme,
    colors: {
        ...PaperLightTheme.colors,
        primary: '#000000',
        onPrimary: '#FFFFFF',
        background: '#FFFFFF',
        surface: '#F3F4F6',
    }
};
