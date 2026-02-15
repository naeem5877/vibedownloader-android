
import { MD3DarkTheme as PaperDarkTheme, MD3LightTheme as PaperLightTheme, configureFonts } from 'react-native-paper';

// Custom Typography if needed, otherwise defaults are good for MD3
const fontConfig = {
    fontFamily: 'System',
};

// VibeDownloader Custom Colors (Vibrant Purple/Indigo Base)
const vibeColors = {
    primary: '#6366F1', // Indigo 500
    onPrimary: '#FFFFFF',
    primaryContainer: '#4338CA', // Indigo 700
    onPrimaryContainer: '#E0E7FF', // Indigo 100

    secondary: '#8B5CF6', // Violet 500
    onSecondary: '#FFFFFF',
    secondaryContainer: '#5B21B6', // Violet 800
    onSecondaryContainer: '#EDE9FE', // Violet 50

    tertiary: '#F472B6', // Pink 400
    onTertiary: '#000000',
    tertiaryContainer: '#831843', // Pink 900
    onTertiaryContainer: '#FCE7F3', // Pink 100

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
        primary: '#4F46E5',
        onPrimary: '#FFFFFF',
        background: '#FFFFFF',
        surface: '#F3F4F6',
    }
};
