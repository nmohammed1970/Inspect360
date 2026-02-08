import React, { useState, useEffect, useRef } from 'react';
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
  Alert,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Eye, EyeOff, AlertCircle, Fingerprint } from 'lucide-react-native';
import { biometricService } from '../../services/biometric';
import { useQuery } from '@tanstack/react-query';
import { apiRequestJson } from '../../services/api';
import Logo from '../../components/ui/Logo';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { moderateScale, getButtonHeight, getFontSize } from '../../utils/responsive';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');
  const [isBiometricPromptActive, setIsBiometricPromptActive] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>('');
  const [errorModalTitle, setErrorModalTitle] = useState<string>('Can\'t find account');
  const passwordInputRef = useRef<TextInput>(null);
  // Use refs to persist error state across remounts
  const errorStateRef = useRef<{ message: string; title: string; showModal: boolean } | null>(null);
  const isSettingErrorRef = useRef(false);
  const { 
    login, 
    isLoading, 
    getStoredEmail, 
    getBiometricCredentials, 
    storeBiometricCredentials,
    hasBiometricCredentials 
  } = useAuth();
  const theme = useTheme();
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  // Ensure text colors are always defined for visibility
  const textPrimary = themeColors?.text?.primary || (theme?.theme === 'dark' ? '#fafafa' : '#0a0a0a');
  const textSecondary = themeColors?.text?.secondary || (theme?.theme === 'dark' ? '#a3a3a3' : '#737373');

  // Fetch user profile to check biometricEnabled
  const { data: profile } = useQuery({
    queryKey: ['/api/auth/profile'],
    queryFn: async () => {
      try {
        return await apiRequestJson<any>('GET', '/api/auth/profile');
      } catch (error) {
        // If not authenticated, return null
        return null;
      }
    },
    enabled: false, // Don't auto-fetch - we'll check after login
    retry: false,
  });

  // Debug: Log modal state changes
  useEffect(() => {
    console.log('[LoginScreen] showErrorModal changed:', showErrorModal);
    console.log('[LoginScreen] errorModalMessage:', errorModalMessage);
    console.log('[LoginScreen] errorModalTitle:', errorModalTitle);
  }, [showErrorModal, errorModalMessage, errorModalTitle]);

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await biometricService.isBiometricAvailable();
      const enrolled = await biometricService.isBiometricEnrolled();
      setIsBiometricAvailable(available && enrolled);
      
      if (available && enrolled) {
        const type = await biometricService.getBiometricTypeName();
        setBiometricType(type);
      }
    };
    checkBiometric();
  }, []);

  // Auto-fill email on mount
  useEffect(() => {
    const loadStoredEmail = async () => {
      const storedEmail = await getStoredEmail();
      if (storedEmail) {
        setEmail(storedEmail);
      }
    };
    loadStoredEmail();
  }, [getStoredEmail]);

  // Check if user has biometric enabled (after login, we'll check profile)
  // For now, we'll check if credentials are stored
  useEffect(() => {
    const checkBiometricStatus = async () => {
      const hasCredentials = await hasBiometricCredentials();
      if (hasCredentials) {
        setBiometricEnabled(true);
      }
    };
    checkBiometricStatus();
  }, [hasBiometricCredentials]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleBiometricLogin = async () => {
    // Prevent multiple simultaneous biometric prompts
    if (isBiometricPromptActive) {
      return;
    }

    try {
      setIsBiometricPromptActive(true);
      setError(null);
      
      // Verify email is entered and matches stored email
      const enteredEmail = email.trim().toLowerCase();
      if (!enteredEmail) {
        setIsBiometricPromptActive(false);
        setError('Please enter your email address.');
        return;
      }

      // Get stored email first (doesn't require biometric)
      const storedEmail = await getStoredEmail();
      if (!storedEmail) {
        setIsBiometricPromptActive(false);
        setError('No biometric credentials found. Please enter your password.');
        return;
      }

      // Verify entered email matches stored email
      if (enteredEmail !== storedEmail.toLowerCase()) {
        setIsBiometricPromptActive(false);
        setError('Email does not match stored biometric credentials. Please enter your password.');
        return;
      }

      // Get stored credentials (this will trigger biometric prompt)
      const credentials = await getBiometricCredentials();
      
      if (!credentials) {
        // Biometric was cancelled or failed - allow manual entry
        setIsBiometricPromptActive(false);
        return;
      }

      // Double-check email matches (security check)
      if (credentials.email.toLowerCase() !== enteredEmail) {
        setIsBiometricPromptActive(false);
        setError('Email mismatch. Please enter your password.');
        return;
      }

      // Auto-login with stored credentials (email already verified)
      await login(credentials.email, credentials.password);
      setIsBiometricPromptActive(false);
    } catch (err: any) {
      console.error('[LoginScreen] Biometric login error:', err);
      setIsBiometricPromptActive(false);
      
      // Determine error message based on error type
      let errorMessage = 'Biometric authentication failed. Please enter your password.';
      let modalTitle = 'Authentication failed';
      
      // Check if it's a server/connection error
      if (err?.message?.includes('Server problem') || 
          err?.message?.includes('Cannot connect to server') ||
          err?.message?.includes('Network request failed')) {
        errorMessage = err.message || 'Server problem. Cannot connect to server. Please check your internet connection and try again later.';
        modalTitle = 'Connection error';
      } else if (err?.status === 401 || err?.status === 403) {
        errorMessage = 'Wrong credentials. Please try again.';
        modalTitle = 'Wrong credentials';
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      // Store in ref FIRST to persist across remounts
      errorStateRef.current = {
        message: errorMessage,
        title: modalTitle,
        showModal: true,
      };
      isSettingErrorRef.current = true;
      
      // Set both inline error and modal
      console.log('[LoginScreen] 🔴 SETTING BIOMETRIC ERROR:', errorMessage);
      setError(errorMessage);
      setErrorModalMessage(errorMessage);
      setErrorModalTitle(modalTitle);
      
      // Show Alert as immediate fallback
      Alert.alert(
        modalTitle,
        errorMessage,
        [{ text: 'OK', onPress: () => console.log('[LoginScreen] Alert dismissed') }],
        { cancelable: true }
      );
      
      // Use setTimeout to ensure state persists
      setTimeout(() => {
        setShowErrorModal(true);
        isSettingErrorRef.current = false;
        console.log('[LoginScreen] Biometric error - Modal should show:', { errorMessage, modalTitle });
      }, 0);
      
      // Also set immediately
      setShowErrorModal(true);
    }
  };

  const handlePasswordFocus = async () => {
    // Prevent triggering if biometric prompt is already active
    if (isBiometricPromptActive) {
      return;
    }

    // Verify email is entered before triggering biometric
    const enteredEmail = email.trim().toLowerCase();
    if (!enteredEmail) {
      return; // Don't trigger biometric if no email entered
    }

    // If biometric is enabled and credentials are stored, trigger biometric
    if (biometricEnabled && isBiometricAvailable) {
      const storedEmail = await getStoredEmail();
      // Only trigger if email matches stored email
      if (storedEmail && enteredEmail === storedEmail.toLowerCase()) {
        const hasCredentials = await hasBiometricCredentials();
        if (hasCredentials) {
          // Small delay to allow field to focus first
          setTimeout(() => {
            handleBiometricLogin();
          }, 300);
        }
      }
    }
  };

  const handleEmailChange = async (text: string) => {
    setEmail(text);
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
    
    // Prevent triggering if biometric prompt is already active
    if (isBiometricPromptActive) {
      return;
    }
    
    // If email matches stored email and biometric is enabled, trigger biometric
    if (biometricEnabled && isBiometricAvailable && text.trim()) {
      const storedEmail = await getStoredEmail();
      if (storedEmail && text.trim().toLowerCase() === storedEmail.toLowerCase()) {
        const hasCredentials = await hasBiometricCredentials();
        if (hasCredentials) {
          // Small delay to allow user to finish typing
          setTimeout(() => {
            handleBiometricLogin();
          }, 500);
        }
      }
    }
  };

  const handleLogin = async () => {
    // Clear previous errors and modal
    setError(null);
    setShowErrorModal(false);
    setErrorModalMessage('');
    errorStateRef.current = null; // Clear ref as well
    isSettingErrorRef.current = false;

    // Validate email format
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      console.log('[LoginScreen] Calling login function');
      const loginEmail = email.trim().toLowerCase();
      await login(loginEmail, password).catch((loginError) => {
        console.error('[LoginScreen] Login promise rejected:', loginError);
        // Re-throw to be caught by outer catch
        throw loginError;
      });
      console.log('[LoginScreen] Login function completed successfully');
      
      // After successful login, check if user has biometricEnabled in profile
      // and store credentials if enabled
      try {
        const userProfile = await apiRequestJson<any>('GET', '/api/auth/profile');
        if (userProfile?.biometricEnabled) {
          // Store credentials for biometric login
          await storeBiometricCredentials(loginEmail, password);
          setBiometricEnabled(true);
          console.log('[LoginScreen] Biometric credentials stored');
        } else {
          // Clear credentials if biometric is disabled
          setBiometricEnabled(false);
        }
      } catch (profileError) {
        console.error('[LoginScreen] Error checking profile:', profileError);
        // Continue even if profile check fails
      }
      
      // Clear error on success
      setError(null);
      // Navigation happens automatically via AppNavigator when isAuthenticated changes
    } catch (err: any) {
      console.error('[LoginScreen] Login error caught:', {
        message: err?.message,
        status: err?.status,
        name: err?.name,
        error: err,
        errorString: JSON.stringify(err),
      });
      
      // Determine user-friendly error message based on error type
      // Check network/connection errors FIRST (they often have undefined status)
      let errorMessage = 'Wrong credentials. Please try again.';
      let errorStatus = err?.status;

      // Handle network connection errors FIRST (status might be undefined)
      if (err?.message?.includes('Failed to fetch') || 
          err?.message?.includes('Network request failed') ||
          err?.message?.includes('ERR_CONNECTION_REFUSED') ||
          err?.message?.includes('NetworkError') ||
          err?.message?.includes('No network connection') ||
          err?.message?.includes('Cannot connect to server') ||
          err?.message?.includes('Server problem')) {
        errorMessage = err.message || 'Server problem. Cannot connect to server. Please check your internet connection and try again later.';
      }
      // Handle authentication errors (wrong password/email)
      else if (err?.status === 401 || err?.status === 403 || errorStatus === 401 || errorStatus === 403) {
        errorMessage = 'Wrong credentials. Please try again.';
        errorStatus = err?.status || errorStatus || 401;
      } 
      // Handle bad request errors
      else if (err?.status === 400) {
        errorMessage = err?.message || 'Invalid request. Please check your credentials.';
      } 
      // Handle server errors (500, 502, 503, 504)
      else if (err?.status === 500 || err?.status === 502 || err?.status === 503 || err?.status === 504) {
        errorMessage = 'Server problem. Please try again sometime later.';
      } 
      // Handle timeout errors
      else if (err?.name === 'AbortError' || err?.message?.includes('timeout') || err?.message?.includes('Timeout')) {
        errorMessage = 'Request timeout. Server is taking too long to respond. Please try again later.';
      } 
      // Handle SSL/Certificate errors
      else if (err?.message?.includes('SSL') || err?.message?.includes('certificate') || err?.message?.includes('CERT')) {
        errorMessage = 'Connection security error. Please contact support.';
      } 
      // Handle access denied errors
      else if (err?.message?.includes('Access denied') || err?.message?.includes('This app is only for inspectors')) {
        errorMessage = err.message;
      }
      // Use the error message from API if it's user-friendly
      else if (err?.message && (
        err.message.includes('Email or password') ||
        err.message.includes('Incorrect') ||
        err.message.includes('Invalid') ||
        err.message.includes('Wrong')
      )) {
        errorMessage = err.message;
      }
      // For any other error, provide a generic message
      else if (err?.message) {
        errorMessage = err.message;
      }

      console.log('[LoginScreen] Setting error message:', errorMessage);
      console.log('[LoginScreen] Error object:', {
        status: err?.status,
        message: err?.message,
        name: err?.name,
        error: err,
      });
      
      // Ensure error is set and visible - use multiple methods to guarantee it shows
      console.log('[LoginScreen] 🔴 SETTING ERROR STATE:', errorMessage);
      setError(errorMessage);
      
      // Also show Alert as immediate fallback (always works)
      Alert.alert(
        modalTitle,
        errorMessage,
        [{ text: 'OK', onPress: () => console.log('[LoginScreen] Alert dismissed') }],
        { cancelable: true }
      );
      
      // Determine modal title based on error type
      let modalTitle = 'Can\'t find account';
      const finalStatus = err?.status || errorStatus;
      if (finalStatus === 401 || finalStatus === 403) {
        modalTitle = 'Wrong credentials';
      } else if (finalStatus === 500 || finalStatus === 502 || finalStatus === 503 || finalStatus === 504) {
        modalTitle = 'Server error';
      } else if (err?.message?.includes('Failed to fetch') || 
                 err?.message?.includes('Network request failed') ||
                 err?.message?.includes('ERR_CONNECTION_REFUSED') ||
                 err?.message?.includes('Cannot connect to server') ||
                 err?.message?.includes('No network connection')) {
        modalTitle = 'Connection error';
      } else if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
        modalTitle = 'Connection timeout';
      }
      
      // ALWAYS show modal for any login error - this is critical for user feedback
      console.log('[LoginScreen] ⚠️ FORCING MODAL TO SHOW - Error detected:', {
        errorMessage,
        modalTitle,
        errorStatus: finalStatus,
      });
      
      // Show error in modal for ALL login errors (wrong credentials, server errors, network issues, etc.)
      // This ensures users always see a clear modal for login failures
      console.log('[LoginScreen] Setting modal state:', {
        message: errorMessage,
        title: modalTitle,
        showModal: true,
      });
      
      // Store in ref FIRST to persist across remounts
      errorStateRef.current = {
        message: errorMessage,
        title: modalTitle,
        showModal: true,
      };
      isSettingErrorRef.current = true;
      
      // Set modal state immediately - use multiple approaches to ensure it sticks
      console.log('[LoginScreen] 🔴 SETTING ERROR STATE:', errorMessage);
      setErrorModalMessage(errorMessage);
      setErrorModalTitle(modalTitle);
      setError(errorMessage);
      
      // Show Alert as immediate fallback (always works, even if component remounts)
      Alert.alert(
        modalTitle,
        errorMessage,
        [{ text: 'OK', onPress: () => console.log('[LoginScreen] Alert dismissed') }],
        { cancelable: true }
      );
      
      // Use setTimeout to ensure state persists even if component tries to remount
      setTimeout(() => {
        setShowErrorModal(true);
        isSettingErrorRef.current = false;
        console.log('[LoginScreen] ✅ Modal state set via setTimeout, showErrorModal should be true');
      }, 0);
      
      // Also set immediately as primary method
      setShowErrorModal(true);
      console.log('[LoginScreen] ✅ Modal state set immediately, showErrorModal should be true');
      
      // Clear password field for security (but keep email)
      setPassword('');
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
                      borderColor: error && !email.trim() ? themeColors.destructive.DEFAULT : themeColors.border.DEFAULT,
                      backgroundColor: themeColors.input,
                      color: themeColors.text.primary
                    }]}
                    placeholder="Enter your email address"
                    placeholderTextColor={themeColors.text.muted}
                    value={email}
                    onChangeText={(text) => {
                      handleEmailChange(text);
                      // Only clear error if user is actively typing (not on initial load)
                      if (error && text.length > 0) {
                        setError(null);
                      }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!isLoading}
                    autoComplete="email"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: textPrimary }]}>Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      ref={passwordInputRef}
                      style={[styles.passwordInput, {
                        borderColor: error && !password.trim() ? themeColors.destructive.DEFAULT : themeColors.border.DEFAULT,
                        backgroundColor: themeColors.input,
                        color: themeColors.text.primary
                      }]}
                      placeholder={biometricEnabled && isBiometricAvailable ? `Use ${biometricType} or enter password` : "Enter your password"}
                      placeholderTextColor={themeColors.text.muted}
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        // Only clear error if user is actively typing (not on initial load)
                        if (error && text.length > 0) {
                          setError(null);
                        }
                      }}
                      onFocus={handlePasswordFocus}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      onSubmitEditing={handleLogin}
                      autoComplete="password"
                      textContentType="password"
                    />
                    {biometricEnabled && isBiometricAvailable ? (
                      <TouchableOpacity
                        style={styles.biometricButton}
                        onPress={handleBiometricLogin}
                        disabled={!!isLoading}
                      >
                        <Fingerprint size={20} color={themeColors.primary.DEFAULT} />
                      </TouchableOpacity>
                    ) : (
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
                    )}
                  </View>
                  {biometricEnabled && isBiometricAvailable && (
                    <Text style={[styles.biometricHint, { color: themeColors.text.muted }]}>
                      Tap {biometricType} icon or password field to login with {biometricType}
                    </Text>
                  )}
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

                {/* Error Message Display - Always visible when error exists */}
                {(error || errorStateRef.current?.message) && (
                  <View style={[styles.errorContainer, {
                    backgroundColor: themeColors.destructive.DEFAULT + '20',
                    borderColor: themeColors.destructive.DEFAULT,
                  }]}>
                    <View style={styles.errorContent}>
                      <AlertCircle size={18} color={themeColors.destructive.DEFAULT} style={styles.errorIcon} />
                      <Text style={[styles.errorText, { color: themeColors.destructive.DEFAULT }]}>
                        {error || errorStateRef.current?.message || 'An error occurred. Please try again.'}
                      </Text>
                    </View>
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

      {/* Error Modal - Shows for wrong credentials, server errors, and connection issues */}
      <Modal
        visible={showErrorModal}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => {
          console.log('[LoginScreen] Modal onRequestClose called');
          setShowErrorModal(false);
          setError(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              console.log('[LoginScreen] Modal overlay pressed');
              setShowErrorModal(false);
              setError(null);
            }}
          />
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalContainer, {
              backgroundColor: themeColors.card.DEFAULT,
              borderColor: themeColors.border.DEFAULT,
            }]}
          >
            <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
              {errorModalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: themeColors.text.secondary }]}>
              {errorModalMessage || 'We couldn\'t log you in. Please check your credentials and try again.'}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, {
                  backgroundColor: themeColors.primary.DEFAULT,
                }]}
                onPress={() => {
                  console.log('[LoginScreen] TRY AGAIN button pressed');
                  setShowErrorModal(false);
                  setError(null);
                }}
              >
                <Text style={[styles.modalButtonText, { color: themeColors.primary.foreground }]}>
                  TRY AGAIN
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
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
  biometricButton: {
    position: 'absolute',
    right: spacing[3],
    padding: spacing[1],
  },
  biometricHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing[1],
    fontStyle: 'italic',
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
    marginTop: spacing[2],
    padding: moderateScale(spacing[3], 0.3, Dimensions.get('window').width),
    borderRadius: moderateScale(borderRadius.md, 0.2, Dimensions.get('window').width),
    borderWidth: 1,
    minHeight: moderateScale(44, 0.3, Dimensions.get('window').width),
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing[2],
  },
  errorIcon: {
    marginRight: spacing[1],
    flexShrink: 0,
  },
  errorText: {
    fontSize: moderateScale(typography.fontSize.sm, 0.3, Dimensions.get('window').width),
    flex: 1,
    textAlign: 'left',
    fontWeight: typography.fontWeight.medium,
    lineHeight: moderateScale(20, 0.3, Dimensions.get('window').width),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: moderateScale(borderRadius.lg, 0.2, Dimensions.get('window').width),
    padding: moderateScale(spacing[6], 0.3, Dimensions.get('window').width),
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: moderateScale(typography.fontSize.xl, 0.3, Dimensions.get('window').width),
    fontWeight: typography.fontWeight.bold,
    marginBottom: moderateScale(spacing[3], 0.3, Dimensions.get('window').width),
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: moderateScale(typography.fontSize.base, 0.3, Dimensions.get('window').width),
    lineHeight: moderateScale(22, 0.3, Dimensions.get('window').width),
    marginBottom: moderateScale(spacing[6], 0.3, Dimensions.get('window').width),
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: moderateScale(spacing[3], 0.3, Dimensions.get('window').width),
  },
  modalButton: {
    flex: 1,
    paddingVertical: moderateScale(spacing[3], 0.3, Dimensions.get('window').width),
    paddingHorizontal: moderateScale(spacing[4], 0.3, Dimensions.get('window').width),
    borderRadius: moderateScale(borderRadius.md, 0.2, Dimensions.get('window').width),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    minHeight: moderateScale(44, 0.3, Dimensions.get('window').width),
  },
  modalButtonText: {
    fontSize: moderateScale(typography.fontSize.sm, 0.3, Dimensions.get('window').width),
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

