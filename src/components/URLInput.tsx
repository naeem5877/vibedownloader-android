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
    placeholder?: string;
}

export const URLInput: React.FC<URLInputProps> = ({
    value,
    onChangeText,
    onSubmit,
    isLoading,
    onPaste,
    platformColor = Colors.primary,
    placeholder = "Paste any video link...",
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
            <Animated.View
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
                    placeholder={placeholder}
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
        paddingHorizontal: 0, 
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#121214', 
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#222225',
        height: 64, 
        ...Shadows.sm,
    },
    iconContainer: {
        paddingLeft: 16,
        paddingRight: 10,
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: 15,
        height: '100%',
        paddingVertical: 0,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 12,
    },
    clearButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    pasteButton: {
        backgroundColor: 'rgba(99, 102, 241, 0.12)', 
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    pasteText: {
        color: '#818CF8', 
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    actionButton: {
        width: 64,
        height: 64,
        borderRadius: 20,
        overflow: 'hidden',
    },
    actionButtonInner: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonDisabled: {
        opacity: 0.4,
    },
});

export default URLInput;
