import React from 'react';
import { TextInput, Text, View, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export default function Input({ label, error, style, multiline, secureTextEntry, editable, autoCorrect, required, ...props }: InputProps) {
  // Ensure boolean props are actually booleans, not strings
  const safeMultiline = typeof multiline === 'boolean' ? multiline : multiline === true || multiline === 'true';
  const safeSecureTextEntry = typeof secureTextEntry === 'boolean' ? secureTextEntry : secureTextEntry === true || secureTextEntry === 'true';
  const safeEditable = typeof editable === 'boolean' ? editable : editable !== false && editable !== 'false';
  const safeAutoCorrect = typeof autoCorrect === 'boolean' ? autoCorrect : autoCorrect !== false && autoCorrect !== 'false';
  // required is just for display, not passed to TextInput
  const safeRequired = typeof required === 'boolean' ? required : required === true || required === 'true';
  
  // Convert any boolean props in the spread props to actual booleans
  const safeProps: any = { ...props };
  const booleanProps = ['autoCapitalize', 'autoFocus', 'blurOnSubmit', 'caretHidden', 'clearButtonMode', 'contextMenuHidden', 'enablesReturnKeyAutomatically', 'importantForAutofill', 'keyboardAppearance', 'selectTextOnFocus', 'showSoftInputOnFocus', 'spellCheck'];
  booleanProps.forEach(prop => {
    if (prop in safeProps && typeof safeProps[prop] === 'string') {
      safeProps[prop] = safeProps[prop] === 'true' || safeProps[prop] === true;
    }
  });
  
  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {safeRequired && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.text.muted}
        multiline={safeMultiline}
        secureTextEntry={safeSecureTextEntry}
        editable={safeEditable}
        autoCorrect={safeAutoCorrect}
        {...safeProps}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    color: colors.text.primary,
  },
  required: {
    color: colors.destructive.DEFAULT,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    fontSize: typography.fontSize.base,
    backgroundColor: colors.background,
    color: colors.text.primary,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.destructive.DEFAULT,
  },
  errorText: {
    color: colors.destructive.DEFAULT,
    fontSize: typography.fontSize.xs,
    marginTop: spacing[1],
  },
});

