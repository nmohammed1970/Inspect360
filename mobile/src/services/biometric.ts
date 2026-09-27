import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export const biometricService = {
  /**
   * Check if device supports biometric authentication
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      return compatible;
    } catch (error) {
      console.error('[BiometricService] Error checking biometric availability:', error);
      return false;
    }
  },

  /**
   * Check if user has enrolled biometrics on device
   */
  async isBiometricEnrolled(): Promise<boolean> {
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return enrolled;
    } catch (error) {
      console.error('[BiometricService] Error checking biometric enrollment:', error);
      return false;
    }
  },

  /**
   * Get available biometric type
   */
  async getBiometricType(): Promise<BiometricType> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'face';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'fingerprint';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        return 'iris';
      }
      return 'none';
    } catch (error) {
      console.error('[BiometricService] Error getting biometric type:', error);
      return 'none';
    }
  },

  /**
   * Get human-readable biometric type name
   */
  async getBiometricTypeName(): Promise<string> {
    const type = await this.getBiometricType();
    switch (type) {
      case 'face':
        return 'Face ID';
      case 'fingerprint':
        return 'Fingerprint';
      case 'iris':
        return 'Iris';
      default:
        return 'Biometric';
    }
  },

  /**
   * Authenticate user with biometric
   */
  async authenticateWithBiometric(
    prompt?: string
  ): Promise<BiometricAuthResult> {
    try {
      // Check if biometric is available
      const isAvailable = await this.isBiometricAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: 'Biometric authentication is not available on this device',
        };
      }

      // Check if user has enrolled biometrics
      const isEnrolled = await this.isBiometricEnrolled();
      if (!isEnrolled) {
        return {
          success: false,
          error: 'No biometric authentication is enrolled on this device',
        };
      }

      // Authenticate
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: prompt || 'Authenticate to login',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow device PIN/password as fallback
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        return { success: true };
      }

      const authError = 'error' in result ? result.error : undefined;
      let errorMessage = 'Biometric authentication failed';

      if (authError === 'user_cancel') {
        errorMessage = 'Authentication cancelled';
      } else if (authError === 'user_fallback') {
        errorMessage = 'User chose to use password';
      } else if (authError === 'system_cancel') {
        errorMessage = 'Authentication was cancelled by system';
      } else if (authError === 'not_available') {
        errorMessage = 'Biometric authentication is not available';
      } else if (authError === 'not_enrolled') {
        errorMessage = 'No biometric authentication is enrolled';
      }

      return {
        success: false,
        error: errorMessage,
      };
    } catch (error: any) {
      console.error('[BiometricService] Error during biometric authentication:', error);
      return {
        success: false,
        error: error?.message || 'Biometric authentication failed',
      };
    }
  },

  /**
   * Check if biometric authentication is ready to use
   * (both available and enrolled)
   */
  async isBiometricReady(): Promise<boolean> {
    const isAvailable = await this.isBiometricAvailable();
    const isEnrolled = await this.isBiometricEnrolled();
    return isAvailable && isEnrolled;
  },
};

