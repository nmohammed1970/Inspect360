import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Eye, EyeOff } from 'lucide-react-native';
import Logo from '../../components/ui/Logo';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { moderateScale, getButtonHeight, getFontSize } from '../../utils/responsive';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuth();
  const theme = useTheme();
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  // Ensure text colors are always defined for visibility
  const textPrimary = themeColors?.text?.primary || (theme?.theme === 'dark' ? '#fafafa' : '#0a0a0a');
  const textSecondary = themeColors?.text?.secondary || (theme?.theme === 'dark' ? '#a3a3a3' : '#737373');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setError(null);
    try {
      console.log('[LoginScreen] Calling login function');
      await login(email.trim().toLowerCase(), password);
      console.log('[LoginScreen] Login function completed successfully');
      // Navigation happens automatically via AppNavigator when isAuthenticated changes
    } catch (err: any) {
      console.error('[LoginScreen] Login error caught:', {
        message: err?.message,
        status: err?.status,
        name: err?.name,
        error: err,
      });
      
      // Use the error message directly - it should already be user-friendly
      // from api.ts and AuthContext error handling
      let errorMessage = 'Email or password is incorrect. Please try again.';

      if (err?.message) {
        // Use the error message if it's user-friendly
        errorMessage = err.message;
      } else if (err?.name === 'AbortError') {
        errorMessage = 'Request timeout. Please check your internet connection.';
      } else if (err?.message?.includes('Failed to fetch') || err?.message?.includes('Network request failed')) {
        errorMessage = 'Cannot connect to server. Please check your internet connection.';
      }

      console.log('[LoginScreen] Setting error message:', errorMessage);
      setError(errorMessage);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <StatusBar style={theme?.theme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: themeColors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Logo and App Name */}
            <View style={styles.logoContainer}>
              <Logo size={80} color={themeColors.primary.DEFAULT} />
              <Text style={[styles.appName, { color: textPrimary }]}>INSPECT 360</Text>
            </View>

            {/* Login Card */}
            <View style={[
              styles.card,
              {
                backgroundColor: themeColors.card.DEFAULT,
                borderColor: themeColors.border.DEFAULT,
                shadowColor: theme?.theme === 'dark' ? '#000000' : '#000000',
                shadowOpacity: theme?.theme === 'dark' ? 0.3 : 0.1,
              }
            ]}>
              <Text style={[styles.welcomeTitle, { color: textPrimary }]}>Welcome back</Text>
              <Text style={[styles.welcomeSubtitle, { color: textSecondary }]}>
                Enter your credentials to access your account
              </Text>

              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: textPrimary }]}>Email Address</Text>
                  <TextInput
                    style={[styles.input, {
                      borderColor: themeColors.border.DEFAULT,
                      backgroundColor: themeColors.input,
                      color: themeColors.text.primary
                    }]}
                    placeholder="Enter your email address"
                    placeholderTextColor={themeColors.text.muted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: textPrimary }]}>Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.passwordInput, {
                        borderColor: themeColors.border.DEFAULT,
                        backgroundColor: themeColors.input,
                        color: themeColors.text.primary
                      }]}
                      placeholder="Enter your password"
                      placeholderTextColor={themeColors.text.muted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                      disabled={!!isLoading}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color={themeColors.text.secondary} />
                      ) : (
                        <Eye size={20} color={themeColors.text.secondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.forgotPassword}
                  onPress={() => {
                    // TODO: Implement forgot password
                  }}
                  disabled={!!isLoading}
                >
                  <Text style={[styles.forgotPasswordText, { color: themeColors.primary.DEFAULT }]}>Forgot password?</Text>
                </TouchableOpacity>

                {error && (
                  <View style={[styles.errorContainer, {
                    backgroundColor: themeColors.destructive.DEFAULT + '15',
                    borderColor: themeColors.destructive.DEFAULT + '30'
                  }]}>
                    <Text style={[styles.errorText, { color: themeColors.destructive.DEFAULT }]}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: themeColors.primary.DEFAULT,
                      borderRadius: moderateScale(borderRadius.md, 0.2, screenWidth),
                      paddingVertical: moderateScale(spacing[4], 0.3, screenWidth),
                      paddingHorizontal: moderateScale(spacing[4], 0.3, screenWidth),
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: getButtonHeight('md', screenWidth),
                      marginTop: moderateScale(spacing[2], 0.3, screenWidth),
                    },
                    isLoading && { opacity: 0.6 }
                  ]}
                  onPress={handleLogin}
                  disabled={!!isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color={themeColors.primary.foreground} />
                  ) : (
                    <Text style={[
                      {
                        fontSize: getFontSize(typography.fontSize.base, screenWidth),
                        fontWeight: typography.fontWeight.semibold,
                        color: themeColors.primary.foreground,
                      }
                    ]}>Sign in</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[8],
    gap: spacing[3],
  },
  appName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
    // Color applied dynamically via themeColors
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    // Border and background colors applied dynamically via themeColors
  },
  welcomeTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[2],
  },
  welcomeSubtitle: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[6],
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: spacing[5],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    fontSize: typography.fontSize.base,
    minHeight: 44,
  },
  passwordContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    paddingRight: 45,
    fontSize: typography.fontSize.base,
    minHeight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: spacing[3],
    padding: spacing[1],
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing[4],
    marginTop: -spacing[2],
  },
  forgotPasswordText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  errorContainer: {
    marginBottom: spacing[4],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
});

