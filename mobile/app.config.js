// Use app.config.js instead of app.json to support dynamic configuration
export default {
  expo: {
    name: "Inspect360",
    slug: "inspect360-mobile",
    version: "1.0.1", // Increment this for each new release (e.g., 1.0.1, 1.0.2, 1.1.0, etc.)
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic", // Supports automatic dark mode based on system settings
    newArchEnabled: true,
    scheme: "inspect360",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.inspect360.mobile",
      buildNumber: "17", // iOS CFBundleVersion; used when appVersionSource is "local" in eas.json
      requiresFullScreen: false,
      // Minimum iOS version supported
      deploymentTarget: "13.4",
      infoPlist: {
        NSCameraUsageDescription: "This app needs access to your camera to capture inspection photos.",
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to select images for inspections.",
        NSPhotoLibraryAddUsageDescription: "This app needs access to save photos to your library.",
        NSMicrophoneUsageDescription: "This app needs access to your microphone to record voice notes for inspections.",
        NSFaceIDUsageDescription: "Use Face ID to login quickly and securely.",
        NSBiometricUsageDescription: "Use biometric authentication to login quickly and securely.",
        UIViewControllerBasedStatusBarAppearance: true,
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        // Required for background sync - using "fetch" mode only
        // "processing" mode requires BGTaskSchedulerPermittedIdentifiers which we don't need
        UIBackgroundModes: ["fetch"]
      },
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.inspect360.mobile",
      versionCode: 17, // Android versionCode; used when appVersionSource is "local" in eas.json
      permissions: [
        "CAMERA",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_NETWORK_STATE",
        "INTERNET"
      ],
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    extra: {
      // API URL - Must be set in .env file as EXPO_PUBLIC_API_URL
      // Fallback to production URL for standalone builds if not set
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://portal.inspect360.ai',
      eas: {
        projectId: "e8d871f6-af78-4846-a1c0-7a55edc54312"
      }
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow Inspect360 to access your camera to capture inspection photos."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow Inspect360 to access your photos to select images for inspections."
        }
      ],
      // Network security plugin for SSL certificate handling
      "./plugins/with-network-security.js"
    ]
  }
};

