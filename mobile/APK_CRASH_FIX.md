# APK Crash Fix - "Inspect360 keeps stopping"

## Problem
The APK crashes immediately on startup with "Inspect360 keeps stopping" error.

## Root Causes Identified

1. **Missing API URL**: If `EXPO_PUBLIC_API_URL` is not set, the app throws an error and crashes
2. **Database Initialization Failures**: If SQLite database fails to initialize, it throws errors
3. **Missing Error Boundaries**: No root-level error boundary to catch initialization errors
4. **Unhandled Promise Rejections**: Some async operations can crash the app if they fail

## Fixes Applied

### 1. Added Root Error Boundary (`mobile/App.tsx`)
- Wrapped entire app in `ErrorBoundary` component
- Prevents app crashes and shows error screen instead

### 2. API URL Fallback (`mobile/src/services/api.ts`)
- Added production URL fallback for standalone builds
- If `EXPO_PUBLIC_API_URL` is not set in production, uses `https://portal.inspect360.ai`
- Prevents crashes during development

### 3. Database Error Handling (`mobile/src/services/localDatabase.ts`)
- Database initialization no longer throws errors
- If database fails, app continues without offline features
- All database methods check if database is available before use

### 4. Auth Context Error Handling (`mobile/src/contexts/AuthContext.tsx`)
- Wrapped `getAPI_URL()` calls in try-catch
- Returns null instead of throwing if API URL is unavailable
- Prevents crashes during authentication checks

### 5. Production API URL Fallback (`mobile/app.config.js`)
- Added fallback to production URL if `EXPO_PUBLIC_API_URL` is not set
- Ensures app.config.js always has an API URL

## How to Build APK Correctly

### Step 1: Set Environment Variable
Create `mobile/.env` file:
```env
EXPO_PUBLIC_API_URL=https://portal.inspect360.ai
```

### Step 2: Build APK
```bash
cd mobile
eas build --platform android --profile production
```

Or using Expo CLI:
```bash
cd mobile
npx expo build:android
```

### Step 3: Test the APK
1. Install the APK on your device
2. Open the app
3. Check logs using `adb logcat` if issues persist

## Debugging Crashes

### View Logs on Android
```bash
adb logcat | grep -i "inspect360\|react\|error"
```

### Common Issues

1. **"EXPO_PUBLIC_API_URL is not set"**
   - Solution: Create `mobile/.env` with `EXPO_PUBLIC_API_URL=https://portal.inspect360.ai`
   - The app now has a fallback, but it's better to set it explicitly

2. **Database initialization errors**
   - Solution: The app now handles these gracefully
   - Offline features will be disabled, but app will still work

3. **Permission errors**
   - Solution: Check `app.config.js` has all required permissions
   - Android manifest should include CAMERA, INTERNET, etc.

## Verification

After applying fixes, the app should:
- ✅ Start without crashing
- ✅ Show login screen even if API URL is not set (with fallback)
- ✅ Continue working even if database fails to initialize
- ✅ Display error messages instead of crashing

## Next Steps

1. Rebuild the APK with the fixes
2. Test on a physical device
3. Check logs if issues persist
4. Ensure `.env` file is created before building

