/**
 * URLInput - URL input field with paste button
 */
import React, { useState, useCallback } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Text,
    StyleSheet,
    Clipboard,
    ActivityIndicator,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../theme';
import { SearchIcon, ClipboardIcon, ChevronRightIcon } from './Icons';

interface URLInputProps {
    value: string;
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    isLoading?: boolean;
    placeholder?: string;
}

export const URLInput: React.FC<URLInputProps> = ({
    value,
    onChangeText,
    onSubmit,
    isLoading = false,
    placeholder = 'Paste link here...',
}) => {
    const handlePaste = useCallback(async () => {
        try {
            const content = await Clipboard.getString();
            if (content) {
                onChangeText(content.trim());
            }
        } catch (error) {
            console.error('Failed to paste:', error);
        }
    }, [onChangeText]);

    return (
        <View style={styles.container}>
            <View style={styles.inputContainer}>
                <SearchIcon size={20} color={Colors.textMuted} />
                <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    onSubmitEditing={onSubmit}
                    editable={!isLoading}
                    selectTextOnFocus
                />
                <TouchableOpacity
                    style={styles.pasteButton}
                    onPress={handlePaste}
                    activeOpacity={0.7}
                    disabled={isLoading}
                >
                    <ClipboardIcon size={18} color={Colors.textSecondary} />
                    <Text style={styles.pasteText}>PASTE</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={[
                    styles.fetchButton,
                    (!value.trim() || isLoading) && styles.fetchButtonDisabled,
                ]}
                onPress={onSubmit}
                disabled={!value.trim() || isLoading}
                activeOpacity={0.8}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                    <>
                        <Text style={styles.fetchText}>FETCH</Text>
                        <ChevronRightIcon size={18} color={Colors.textPrimary} />
                    </>
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: Spacing.md,
        gap: Spacing.sm,
        height: 52,
        ...Shadows.sm,
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: Typography.sizes.base,
        paddingVertical: 0,
    },
    pasteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surfaceHover,
    },
    pasteText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.xs,
        fontWeight: Typography.weights.medium,
    },
    fetchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: Spacing.lg,
        height: 52,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surfaceElevated,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.sm,
    },
    fetchButtonDisabled: {
        opacity: 0.5,
    },
    fetchText: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.sm,
        fontWeight: Typography.weights.semibold,
    },
});

export default URLInput;
