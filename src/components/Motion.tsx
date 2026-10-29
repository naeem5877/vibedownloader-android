/**
 * Motion primitives — one feel across the whole app.
 *  - PressScale: spring press feedback + haptic tick (replaces TouchableOpacity)
 *  - Reveal:     staggered fade + rise entrance
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  ViewStyle,
  PressableProps,
} from 'react-native';
import { Haptics } from '../utils/haptics';

export const Ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1), // fast start, long soft landing
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};

interface PressScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>; // applied to the scaling view
  containerStyle?: StyleProp<ViewStyle>; // applied to the Pressable (flex/width)
  scaleTo?: number;
  haptic?: boolean;
}

export const PressScale: React.FC<PressScaleProps> = ({
  children,
  style,
  containerStyle,
  scaleTo = 0.95,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 50,
      bounciness: to === 1 ? 10 : 0,
    }).start();

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={e => {
        spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        spring(1);
        onPressOut?.(e);
      }}
      onPress={e => {
        if (haptic) Haptics.impact();
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

interface RevealProps {
  children: React.ReactNode;
  index?: number; // stagger position
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export const Reveal: React.FC<RevealProps> = ({
  children,
  index = 0,
  distance = 14,
  style,
}) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 480,
      delay: 60 + index * 70,
      easing: Ease.out,
      useNativeDriver: true,
    }).start();
  }, [t, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};
