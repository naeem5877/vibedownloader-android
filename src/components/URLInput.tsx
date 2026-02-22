import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Text,
    Animated,
    Easing,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SearchIcon, CloseIcon, ArrowRightIcon } from './Icons';

interface URLInputProps {
    value: string;
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    onPaste?: () => void;
    platformColor?: string;
}

export const URLInput: React.FC<URLInputProps> = ({
    value,
    onChangeText,
    onSubmit,
    isLoading,
    onPaste,
    platformColor = Colors.primary,
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const focusAnimation = useRef(new Animated.Value(0)).current;
    const pulseAnimation = useRef(new Animated.Value(1)).current;
    const rotateAnimation = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(focusAnimation, {
            toValue: isFocused ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
            easing: Easing.out(Easing.cubic),
        }).start();
    }, [isFocused]);

    useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.timing(rotateAnimation, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                    easing: Easing.linear,
                })
            ).start();
        } else {
            rotateAnimation.setValue(0);
        }
    }, [isLoading]);

    const clearInput = () => {
        onChangeText('');
    };

    const borderColor = focusAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.border, platformColor],
    });



    return (
        <View style={styles.container}>
            {/* Search Icon */}\n            <Animated.View
                style={[
                    styles.inputWrapper,
                    {
                        borderColor: borderColor,
                    }
                ]}
            >
                {/* Search Icon */}
                <View style={styles.iconContainer}>
                    <SearchIcon
                        size={20}
                        color={isFocused ? platformColor : Colors.textMuted}
                    />
                </View>

                <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder="Paste any video link..."
                    placeholderTextColor={Colors.textMuted}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onSubmitEditing={onSubmit}
                    returnKeyType="go"
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={platformColor}
                    editable={!isLoading}
                />

                {/* Right Actions */}
                <View style={styles.rightActions}>
                    {value.length > 0 ? (
                        <TouchableOpacity
                            onPress={clearInput}
                            style={styles.clearButton}
                            activeOpacity={0.7}
                        >
                            <CloseIcon size={16} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={onPaste}
                            style={styles.pasteButton}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.pasteText}>PASTE</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>

            {/* Submit Button */}
            <TouchableOpacity
                style={[
                    styles.actionButton,
                    (!value || isLoading) && styles.actionButtonDisabled
                ]}
                onPress={onSubmit}
                disabled={!value || isLoading}
                activeOpacity={0.8}
            >
                <View
                    style={[
                        styles.actionButtonInner,
                        { backgroundColor: value && !isLoading ? platformColor : Colors.surfaceElevated }
                    ]}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                        <ArrowRightIcon size={22} color="#FFF" />
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    inputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceMedium,
        borderRadius: BorderRadius.xl,
        borderWidth: 1.5,
        borderColor: Colors.innerBorder,
        height: 60,
        overflow: 'hidden',
    },
    iconContainer: {
        paddingLeft: Spacing.md,
        paddingRight: Spacing.xs,
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        height: '100%',
        paddingVertical: 0,
        fontWeight: Typography.weights.medium,
        letterSpacing: Typography.letterSpacing.normal,
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: Spacing.sm,
    },
    clearButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.surfaceHigh,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pasteButton: {
        backgroundColor: Colors.surfaceAccent,
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.innerBorder,
    },
    pasteText: {
        color: Colors.primary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.bold,
        letterSpacing: Typography.letterSpacing.wider,
    },
    actionButton: {
        width: 60,
        height: 60,
        borderRadius: 18, // Changed to match industrial square-round look
        overflow: 'hidden',
        elevation: 8,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
    },
    actionButtonInner: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonDisabled: {
        opacity: 0.4,
        shadowOpacity: 0,
    },
});

export default URLInput;
