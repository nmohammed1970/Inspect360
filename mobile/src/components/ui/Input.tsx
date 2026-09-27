import React from 'react';
import { TextInput, Text, View, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  required?: boolean | string;
  value?: string;
  onChangeText?: (text: string) => void;
}

export default function Input({
  label,
  error,
  style,
  multiline,
  secureTextEntry,
  editable,
  autoCorrect,
  required,
  ...props
}: InputProps) {
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { getButtonHeight, getFontSize } = useResponsive();
  const isTrue = (val: any) => val === true || val === 'true';
  const isNotFalse = (val: any) => val !== false && val !== 'false';

  const safeMultiline = isTrue(multiline);
  const safeSecureTextEntry = isTrue(secureTextEntry);
  const safeEditable = isNotFalse(editable);
  const safeAutoCorrect = isNotFalse(autoCorrect);
  const safeRequired = isTrue(required);

  const safeProps: any = { ...props };
  const booleanProps = [
    'autoFocus',
    'blurOnSubmit',
    'caretHidden',
    'contextMenuHidden',
    'enablesReturnKeyAutomatically',
    'selectTextOnFocus',
    'showSoftInputOnFocus',
    'spellCheck',
    'scrollEnabled',
  ];
  booleanProps.forEach((prop) => {
    if (prop in safeProps) {
      if (typeof safeProps[prop] === 'string') {
        safeProps[prop] = safeProps[prop].toLowerCase() === 'true';
      } else {
        safeProps[prop] = !!safeProps[prop];
      }
    }
  });

  if ('autoCapitalize' in safeProps && typeof safeProps.autoCapitalize === 'boolean') {
    safeProps.autoCapitalize = safeProps.autoCapitalize ? 'sentences' : 'none';
  }

  return (
    <View style={styles.container}>
      {label && (
        <Text
          style={[
            styles.label,
            { color: themeColors.text.primary, fontSize: getFontSize(typography.fontSize.sm) },
          ]}
        >
          {label}
          {safeRequired && (
            <Text style={{ color: themeColors.destructive.DEFAULT }}> *</Text>
          )}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          {
            borderColor: themeColors.border.DEFAULT,
            backgroundColor: themeColors.input,
            color: themeColors.text.primary,
            fontSize: getFontSize(typography.fontSize.base),
            minHeight: safeMultiline ? getButtonHeight('lg') * 2 : getButtonHeight('md'),
          },
          !!error && { borderColor: themeColors.destructive.DEFAULT },
          style,
        ]}
        placeholderTextColor={themeColors.text.muted}
        multiline={safeMultiline}
        secureTextEntry={safeSecureTextEntry}
        editable={safeEditable}
        autoCorrect={safeAutoCorrect}
        {...safeProps}
      />
      {error && (
        <Text
          style={[
            styles.errorText,
            { color: themeColors.destructive.DEFAULT, fontSize: getFontSize(typography.fontSize.xs) },
          ]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.sans,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontFamily: typography.fontFamily.sans,
  },
  errorText: {
    marginTop: spacing[1],
  },
});
