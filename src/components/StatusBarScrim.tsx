import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme';

/**
 * Edge-to-edge: the app draws behind a transparent status bar, so content that
 * scrolls up under it would clash with the system icons (clock, signal,
 * battery). This lays a scrim over the status bar area: fully solid behind the
 * icons, then an eased gradient that melts into the content below.
 *
 * One real SVG gradient with eased stops. Stacked flat translucent strips draw
 * visible bands, and a plain two-stop gradient shows a hard "line" where it
 * starts, so neither looks smooth. Pass an Animated value as `opacity` to fade
 * it in as the user scrolls; it is invisible at rest.
 */

// Height of the gradient that fades out below the solid status-bar band.
const FADE_HEIGHT = 36;

// [position within the fade 0-1, opacity] — eased (smoothstep-like) curve.
const FADE_STOPS: [number, number][] = [
    [0, 1],
    [0.12, 0.96],
    [0.25, 0.88],
    [0.4, 0.74],
    [0.55, 0.56],
    [0.7, 0.36],
    [0.85, 0.16],
    [1, 0],
];

interface StatusBarScrimProps {
    opacity?: Animated.AnimatedInterpolation<number> | number;
    /** Six-digit hex. Defaults to the app background. */
    color?: string;
}

export const StatusBarScrim: React.FC<StatusBarScrimProps> = ({ opacity = 1, color = Colors.background }) => {
    const { top } = useSafeAreaInsets();
    if (top <= 0) return null;

    const total = top + FADE_HEIGHT;
    const solidEnd = top / total;

    const stops = [
        <Stop key="s0" offset={0} stopColor={color} stopOpacity={1} />,
        <Stop key="s1" offset={solidEnd} stopColor={color} stopOpacity={1} />,
        ...FADE_STOPS.slice(1).map(([p, o]) => (
            <Stop
                key={p}
                offset={solidEnd + p * (1 - solidEnd)}
                stopColor={color}
                stopOpacity={o}
            />
        )),
    ];

    return (
        <Animated.View pointerEvents="none" style={[styles.root, { height: total, opacity }]}>
            <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                    <LinearGradient id="statusBarScrim" x1="0" y1="0" x2="0" y2="1">
                        {stops}
                    </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#statusBarScrim)" />
            </Svg>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    root: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        // Above scrolling content, below the offline banner (9999).
        zIndex: 10,
    },
});
