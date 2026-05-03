import { Vibration, Platform } from 'react-native';
import { LocalDB } from '../services/LocalDB';

let isHapticsEnabled = false;

// Initial load
LocalDB.getSetting('pref_haptics', false).then(val => {
    isHapticsEnabled = val;
}).catch(() => {});

const checkHaptics = () => {
    return Platform.OS === 'android' && Vibration && typeof Vibration.vibrate === 'function' && isHapticsEnabled;
};

/**
 * Industrial Haptic System
 * Provides consistent tactile feedback across the application
 */
export const Haptics = {
    /**
     * Update the haptics enabled state
     */
    setEnabled: (enabled: boolean) => {
        isHapticsEnabled = enabled;
    },

    /**
     * Subtle tap - used for standard button clicks
     */
    selection: () => {
        try {
            if (checkHaptics()) {
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
            if (checkHaptics()) {
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
            if (checkHaptics()) {
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
            if (checkHaptics()) {
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
            if (checkHaptics()) {
                Vibration.vibrate([0, 50, 100, 50]);
            }
        } catch (error) {
            console.warn('Haptics failed:', error);
        }
    }
};
