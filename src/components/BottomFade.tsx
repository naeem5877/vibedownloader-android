import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Soft dark fade from transparent to near-black at the bottom of a tile, so
 * text stays readable over any thumbnail.
 *
 * A real gradient with eased stops: stacking a few flat translucent layers (what
 * this replaced) draws visible horizontal bands where each layer starts. The
 * eased curve also avoids the harsh "line" a straight two-stop gradient shows
 * where it begins.
 */
const STOPS: [number, number][] = [
    [0, 0],
    [0.14, 0.03],
    [0.28, 0.09],
    [0.42, 0.2],
    [0.56, 0.35],
    [0.7, 0.54],
    [0.84, 0.73],
    [1, 0.88],
];

interface BottomFadeProps {
    /** Share of the tile height the fade covers, 0-1. */
    height?: number;
}

export const BottomFade: React.FC<BottomFadeProps> = React.memo(({ height = 0.7 }) => (
    <View
        pointerEvents="none"
        style={[styles.wrap, { height: `${Math.round(height * 100)}%` }]}
    >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
                <LinearGradient id="libraryTileFade" x1="0" y1="0" x2="0" y2="1">
                    {STOPS.map(([offset, opacity]) => (
                        <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                    ))}
                </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#libraryTileFade)" />
        </Svg>
    </View>
));

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
});

export default BottomFade;
