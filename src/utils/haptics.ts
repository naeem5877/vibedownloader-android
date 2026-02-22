import { Vibration, Platform } from 'react-native';

/**
 * Industrial Haptic System
 * Provides consistent tactile feedback across the application
 */
export const Haptics = {
    /**
     * Subtle tap - used for standard button clicks
     */
    selection: () => {
        try {
            if (Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function') {
                Vibration.vibrate(10);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    },

    /**
     * Mechanical click - used for platform chips and toggles
     */
    impact: () => {
        try {
            if (Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function') {
                Vibration.vibrate(20);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    },

    /**
     * Heavy industrial feedback - used for critical actions like start download
     */
    heavy: () => {
        try {
            if (Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function') {
                Vibration.vibrate(40);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    },

    /**
     * Success sequence - used for fetch or download completion
     */
    success: () => {
        try {
            if (Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function') {
                Vibration.vibrate([0, 15, 50, 20]);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    },

    /**
     * Error/Warning sequence
     */
    error: () => {
        try {
            if (Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function') {
                Vibration.vibrate([0, 50, 100, 50]);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    }
};
