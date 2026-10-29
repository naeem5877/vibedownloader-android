/**
 * AmbientGlow - the desktop app's header wash: a soft radial fade of the
 * selected platform's colour from the top edge of the screen. It sits behind
 * the content and cross-fades whenever the platform changes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ease } from './Motion';

interface AmbientGlowProps {
  color: string;
  height?: number;
  intensity?: number;
}

const Layer: React.FC<{
  id: string;
  color: string;
  height: number;
  intensity: number;
}> = ({ id, color, height, intensity }) => {
  // X's brand colour is white, which would flood the header; keep it quiet.
  const peak = color.toUpperCase() === '#FFFFFF' ? intensity * 0.45 : intensity;
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <RadialGradient
          id={id}
          cx="50%"
          cy="0%"
          fx="50%"
          fy="0%"
          rx="60%"
          ry="100%"
        >
          <Stop offset="0" stopColor={color} stopOpacity={peak} />
          <Stop offset="0.5" stopColor={color} stopOpacity={peak * 0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill={`url(#${id})`} />
    </Svg>
  );
};

export const AmbientGlow: React.FC<AmbientGlowProps> = ({
  color,
  height = 440,
  intensity = 0.2,
}) => {
  const [prev, setPrev] = useState(color);
  const [cur, setCur] = useState(color);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (color === cur) return;
    setPrev(cur);
    setCur(color);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      easing: Ease.out,
      useNativeDriver: true,
    }).start();
  }, [color, cur, fade]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.layer, { height, opacity: Animated.subtract(1, fade) }]}
      >
        <Layer id="glow-prev" color={prev} height={height} intensity={intensity} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.layer, { height, opacity: fade }]}
      >
        <Layer id="glow-cur" color={cur} height={height} intensity={intensity} />
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default AmbientGlow;
