/**
 * ShinyText - Premium animated text shimmer effect for React Native
 * Adapted from web-based Framer Motion shimmer effects for industrial UI.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, {
    Defs,
    LinearGradient,
    Stop,
    Text as SvgText,
} from 'react-native-svg';

const AnimatedStop = Animated.createAnimatedComponent(Stop);

interface ShinyTextProps {
    text: string;
    disabled?: boolean;
    speed?: number;
    color?: string;
    shineColor?: string;
    fontSize?: number;
    fontWeight?: any;
    letterSpacing?: number;
    textAlign?: 'left' | 'center' | 'right';
    style?: any;
    yoyo?: boolean;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
    text,
    disabled = false,
    speed = 2,
    color = '#8F8F8F',
    shineColor = '#ffffff',
    fontSize = 12,
    fontWeight = '900',
    letterSpacing = 1,
    textAlign = 'left',
    style,
    yoyo = false
}) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    // Unique ID for the gradient to prevent collisions between multiple ShinyText components
    const gradientId = useMemo(() => `shiny-grad-${Math.random().toString(36).substring(7)}`, []);

    useEffect(() => {
        if (disabled) {
            animatedValue.setValue(0);
            return;
        }

        const animation = Animated.timing(animatedValue, {
            toValue: 1,
            duration: speed * 1000,
            easing: Easing.linear,
            useNativeDriver: false,
        });

        const loop = Animated.loop(
            yoyo
                ? Animated.sequence([
                    animation,
                    Animated.timing(animatedValue, {
                        toValue: 0,
                        duration: speed * 1000,
                        easing: Easing.linear,
                        useNativeDriver: false,
                    })
                ])
                : animation
        );

        loop.start();
        return () => loop.stop();
    }, [disabled, speed, yoyo]);

    // Animate the stops for a shimmer sweep across the text
    const offset1 = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-1, 1],
    });
    const offset2 = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-0.5, 1.5],
    });
    const offset3 = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 2],
    });

    return (
        <View style={[{ height: fontSize * 1.5, width: '100%' }, style]}>
            <Svg height="100%" width="100%">
                <Defs>
                    <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <AnimatedStop offset={offset1} stopColor={color} />
                        <AnimatedStop offset={offset2} stopColor={shineColor} />
                        <AnimatedStop offset={offset3} stopColor={color} />
                    </LinearGradient>
                </Defs>
                <SvgText
                    x={textAlign === 'center' ? '50%' : '0'}
                    y={fontSize * 1.1}
                    fontSize={fontSize}
                    fontWeight={fontWeight}
                    fill={`url(#${gradientId})`}
                    textAnchor={textAlign === 'center' ? 'middle' : 'start'}
                    letterSpacing={letterSpacing}
                >
                    {text}
                </SvgText>
            </Svg>
        </View>
    );
};

export default ShinyText;
