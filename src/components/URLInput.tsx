import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Text,
  Animated,
} from 'react-native';
import { Colors, getOnPlatformColor } from '../theme';
import { SearchIcon, CloseIcon, ClipboardIcon, DownloadIcon } from './Icons';
import { PressScale, Ease } from './Motion';

interface URLInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onPaste?: () => void;
  platformColor?: string;
  placeholder?: string;
}

/**
 * Field + one primary action.
 * Empty field  -> the button reads "Paste link" and pastes from the clipboard.
 * Filled field -> the button reads "Download" and fetches.
 */
export const URLInput: React.FC<URLInputProps> = ({
  value,
  onChangeText,
  onSubmit,
  isLoading,
  onPaste,
  platformColor = Colors.primary,
  placeholder = 'Paste a link',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const hasValue = value.length > 0;

  useEffect(() => {
    Animated.timing(focus, {
      toValue: isFocused ? 1 : 0,
      duration: 220,
      easing: Ease.out,
      useNativeDriver: false,
    }).start();
  }, [focus, isFocused]);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: hasValue ? 1 : 0,
      duration: 260,
      easing: Ease.out,
      useNativeDriver: false,
    }).start();
  }, [fill, hasValue]);

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', `${platformColor}80`],
  });
  const glowOpacity = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });
  const buttonBg = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.glassFillStrong, platformColor],
  });
  const onFill = hasValue ? getOnPlatformColor(platformColor) : '#FFFFFF';

  return (
    <View>
      <Animated.View
        style={[
          styles.field,
          {
            borderColor,
            shadowColor: platformColor,
            shadowOpacity: glowOpacity as unknown as number,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <View style={styles.icon}>
          <SearchIcon
            size={20}
            color={isFocused || hasValue ? platformColor : Colors.textMuted}
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
        {hasValue && !isLoading && (
          <PressScale
            onPress={() => onChangeText('')}
            scaleTo={0.85}
            hitSlop={10}
          >
            <View style={styles.clear}>
              <CloseIcon size={14} color={Colors.textSecondary} />
            </View>
          </PressScale>
        )}
      </Animated.View>

      <PressScale
        onPress={hasValue ? onSubmit : onPaste}
        disabled={isLoading}
        scaleTo={0.97}
        haptic
        containerStyle={styles.buttonWrap}
      >
        <Animated.View style={[styles.button, { backgroundColor: buttonBg }]}>
          {isLoading ? (
            <ActivityIndicator color={onFill} size="small" />
          ) : (
            <>
              {hasValue ? (
                <DownloadIcon size={20} color={onFill} />
              ) : (
                <ClipboardIcon size={20} color={onFill} />
              )}
              <Text style={[styles.buttonText, { color: onFill }]}>
                {hasValue ? 'Download' : 'Paste link'}
              </Text>
            </>
          )}
        </Animated.View>
      </PressScale>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: Colors.glassFill,
    paddingLeft: 6,
    paddingRight: 12,
    elevation: 0,
  },
  icon: { width: 40, alignItems: 'center' },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.2,
    paddingVertical: 0,
    height: '100%',
  },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonWrap: { marginTop: 10 },
  button: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export default URLInput;
