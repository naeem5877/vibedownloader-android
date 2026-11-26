/**
 * OfflineState — the Home screen's "no connection" card.
 *
 * Replaces the old emoji + wall-of-text card. It says what happened in one
 * line, what still works in another, and gives two clear actions: open the
 * library (works offline) or re-check the connection.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BorderRadius, Colors, Spacing } from '../theme';
import { LibraryIcon, RefreshIcon, WifiOffIcon } from './Icons';
import { PressScale, Reveal } from './Motion';

interface OfflineStateProps {
  onOpenLibrary?: () => void;
  /**
   * Re-check connectivity. Resolve `true` when the device is back online and
   * `false` when it is still offline (shows a hint under the buttons).
   */
  onRetry?: () => Promise<boolean | void> | boolean | void;
}

/** Keeps "Checking…" on screen long enough to read instead of flashing. */
const MIN_CHECK_MS = 700;
const HINT_MS = 4000;

export const OfflineState: React.FC<OfflineStateProps> = ({
  onOpenLibrary,
  onRetry,
}) => {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const mounted = useRef(true);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slow "sonar" ring behind the icon. Native-driven, one value, nodes memoised.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ringScale = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }),
    [pulse],
  );
  const ringOpacity = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    [pulse],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  const handleRetry = useCallback(async () => {
    if (checking || !onRetry) return;
    setChecking(true);
    setStillOffline(false);
    if (hintTimer.current) clearTimeout(hintTimer.current);

    const started = Date.now();
    let online: boolean | void = false;
    try {
      online = await onRetry();
    } catch {
      online = false;
    }
    const wait = Math.max(0, MIN_CHECK_MS - (Date.now() - started));
    if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));

    if (!mounted.current) return; // went online: this card is already gone
    setChecking(false);
    if (online === false) {
      setStillOffline(true);
      hintTimer.current = setTimeout(() => {
        if (mounted.current) setStillOffline(false);
      }, HINT_MS);
    }
  }, [checking, onRetry]);

  return (
    <Reveal style={styles.card}>
      <View style={styles.iconWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
        <View style={styles.iconDisc}>
          <WifiOffIcon size={30} color={Colors.textPrimary} />
        </View>
      </View>

      <View style={styles.chip}>
        <View style={styles.chipDot} />
        <Text style={styles.chipText}>OFFLINE</Text>
      </View>

      <Text style={styles.title}>No internet connection</Text>
      <Text style={styles.subtitle}>
        Downloads are paused until you’re back online. Your library is still
        available.
      </Text>

      <View style={styles.actions}>
        {onOpenLibrary && (
          <PressScale
            onPress={onOpenLibrary}
            haptic
            scaleTo={0.97}
            containerStyle={styles.fullWidth}
            accessibilityRole="button"
            accessibilityLabel="Open library"
          >
            <View style={styles.primaryBtn}>
              <LibraryIcon size={18} color={Colors.onPrimary} />
              <Text style={styles.primaryText}>Open Library</Text>
            </View>
          </PressScale>
        )}

        {onRetry && (
          <PressScale
            onPress={handleRetry}
            disabled={checking}
            scaleTo={0.97}
            containerStyle={styles.fullWidth}
            accessibilityRole="button"
            accessibilityLabel="Check connection again"
          >
            <View style={styles.secondaryBtn}>
              {checking ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <RefreshIcon size={16} color={Colors.textSecondary} />
              )}
              <Text style={styles.secondaryText}>
                {checking ? 'Checking…' : 'Try again'}
              </Text>
            </View>
          </PressScale>
        )}
      </View>

      {stillOffline && (
        <Text style={styles.hint}>
          Still offline. Check Wi‑Fi or mobile data, then try again.
        </Text>
      )}
    </Reveal>
  );
};

const DISC = 76;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: DISC,
    height: DISC,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  ring: {
    position: 'absolute',
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  iconDisc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glassFillStrong,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    marginBottom: Spacing.md,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.error,
  },
  chipText: {
    color: Colors.error,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: Spacing.sm,
    maxWidth: 290,
  },
  actions: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: Spacing.lg,
  },
  fullWidth: { alignSelf: 'stretch' },
  primaryBtn: {
    height: 50,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
  },
  primaryText: {
    color: Colors.onPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  secondaryBtn: {
    height: 46,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.glassFill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  secondaryText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});

export default OfflineState;
