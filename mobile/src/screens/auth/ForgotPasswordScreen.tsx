import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import FormScreen from '../../components/ui/FormScreen';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/ui/Logo';
import { tenantService } from '../../services/tenant';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const { moderateScale, getFontSize, getButtonHeight, isSmall } = useResponsive();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await tenantService.forgotPassword(trimmed);
      setSuccess(true);
    } catch (e: any) {
      // Match web: still show generic success for most cases to avoid account enumeration,
      // but surface validation/network failures when the request clearly failed.
      const status = e?.status;
      if (status === 400) {
        setError(e?.message || 'Please enter a valid email address.');
      } else if (!status || status >= 500) {
        setError('We could not send a reset email. Please try again.');
      } else {
        setSuccess(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <FormScreen
        constrainWidth
        edges={{ top: true, bottom: true }}
        contentContainerStyle={[
          styles.content,
          isSmall && styles.contentCompact,
        ]}
      >
        <Logo size={moderateScale(48)} />
        <Text style={[styles.title, { color: themeColors.text?.primary ?? colors.foreground, fontSize: getFontSize(24) }]}>
          Forgot password
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: themeColors.text?.secondary ?? colors.muted.foreground,
              fontSize: getFontSize(14),
              lineHeight: getFontSize(20),
            },
          ]}
        >
          Enter the email for your tenant account. If an account exists, we will send reset instructions.
        </Text>

        {success ? (
          <View style={[styles.successBox, { backgroundColor: themeColors.primary?.light ?? '#E0F7FA' }]}>
            <Text
              style={[
                styles.successText,
                {
                  color: themeColors.primary?.dark ?? '#008B8D',
                  fontSize: getFontSize(14),
                  lineHeight: getFontSize(20),
                },
              ]}
            >
              If an account exists for that email, you will receive password reset instructions shortly.
              Check your inbox and spam folder for the 6-digit code.
            </Text>
            <Button
              title="Enter reset code"
              onPress={() => navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() })}
              style={[styles.mt, { minHeight: getButtonHeight() }]}
            />
            <Button title="Back to login" variant="outline" onPress={() => navigation.navigate('Login')} />
          </View>
        ) : (
          <>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!submitting}
            />
            {error ? (
              <Text style={[styles.error, { color: themeColors.destructive?.DEFAULT ?? '#ef4444', fontSize: getFontSize(13) }]}>
                {error}
              </Text>
            ) : null}
            <Button
              title={submitting ? 'Sending…' : 'Send reset link'}
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.mt, { minHeight: getButtonHeight() }]}
            />
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.backLink}
              accessibilityRole="button"
              accessibilityLabel="Back to login"
            >
              <Text style={{ color: themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT, fontSize: getFontSize(14) }}>
                Back to login
              </Text>
            </TouchableOpacity>
          </>
        )}
      </FormScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
    minWidth: 0,
  },
  contentCompact: {
    gap: spacing.sm,
  },
  title: {
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  error: {},
  successBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  successText: {},
  mt: {
    marginTop: spacing.sm,
  },
  backLink: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
});
