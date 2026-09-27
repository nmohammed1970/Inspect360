import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MIN_PASSWORD_LENGTH } from '../../../../shared/passwordPolicy';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import FormScreen from '../../components/ui/FormScreen';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Logo from '../../components/ui/Logo';
import { apiRequestJson } from '../../services/api';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const { moderateScale, getFontSize, getButtonHeight, isSmall } = useResponsive();
  const [email, setEmail] = useState(route.params?.email?.trim() || '');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedToken = token.replace(/\D/g, '').trim();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (normalizedToken.length !== 6) {
      setError('Please enter the 6-digit reset code from your email.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await apiRequestJson('POST', '/api/reset-password', {
        email: normalizedEmail,
        token: normalizedToken,
        newPassword,
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to reset password.');
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
        <Text style={[styles.title, { color: themeColors.text?.primary, fontSize: getFontSize(24) }]}>
          Reset password
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: themeColors.text?.secondary,
              fontSize: getFontSize(14),
              lineHeight: getFontSize(20),
            },
          ]}
        >
          Enter the 6-digit code from your email and choose a new password.
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
              Password reset successful. You can now sign in with your new password.
            </Text>
            <Button
              title="Back to login"
              onPress={() => navigation.navigate('Login')}
              style={[styles.mt, { minHeight: getButtonHeight() }]}
            />
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
            <Input
              label="Reset code"
              value={token}
              onChangeText={setToken}
              keyboardType="number-pad"
              maxLength={6}
              editable={!submitting}
              placeholder="6-digit code"
            />
            <Input
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              editable={!submitting}
            />
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!submitting}
            />
            {error ? (
              <Text style={[styles.error, { color: themeColors.destructive?.DEFAULT ?? '#ef4444', fontSize: getFontSize(13) }]}>
                {error}
              </Text>
            ) : null}
            <Button
              title={submitting ? 'Resetting…' : 'Reset password'}
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.mt, { minHeight: getButtonHeight() }]}
            />
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.backLink}
              accessibilityRole="button"
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
  title: { fontWeight: '700', marginTop: spacing.lg },
  subtitle: { marginBottom: spacing.sm },
  error: {},
  successBox: { padding: spacing.md, borderRadius: borderRadius.md, gap: spacing.md },
  successText: {},
  mt: { marginTop: spacing.sm },
  backLink: { alignSelf: 'center', paddingVertical: spacing.md },
});
