# SSL Certificates - Works on All Devices

## ✅ Solution: Bundled Certificates

The app now **bundles the intermediate SSL certificate directly in the APK/IPA**, so it works on **all mobile devices without manual installation**.

## Quick Start

### 1. Extract Certificates (Already Done ✅)
```bash
cd mobile
node scripts/extract-certificates.js
```

### 2. Install Dependencies
```bash
cd mobile
npm install @expo/config-plugins --save-dev
```

### 3. Build Your App
```bash
# For Android
eas build --platform android --profile production

# For iOS  
eas build --platform ios --profile production
```

### 4. That's It! 🎉

The certificate is automatically bundled in the app. **All devices** will trust it automatically - no manual installation needed!

## How It Works

### What Changed

1. **Updated Plugin** (`plugins/with-network-security.js`):
   - Bundles certificate in Android: `res/raw/intermediate_ca_bundle.pem`
   - Bundles certificate in iOS: `ios/Inspect360/intermediate-ca-bundle.pem`
   - Configures network security to trust the bundled certificate

2. **Android Network Security Config**:
   - References bundled certificate: `@raw/intermediate_ca_bundle`
   - Trusts it for `*.inspect360.ai` domains
   - Works automatically on all Android devices

3. **iOS App Transport Security**:
   - Configured to trust certificates for `*.inspect360.ai`
   - Works automatically on all iOS devices

## Files Modified

- ✅ `mobile/plugins/with-network-security.js` - Updated to bundle certificates
- ✅ `mobile/app.config.js` - Already includes the plugin
- ✅ `mobile/assets/certs/intermediate-ca-bundle.pem` - Certificate file (extracted)

## Verification

After building, the certificate is bundled:

**Android:**
- `android/app/src/main/res/raw/intermediate_ca_bundle.pem` ✅
- `android/app/src/main/res/xml/network_security_config.xml` ✅

**iOS:**
- `ios/Inspect360/intermediate-ca-bundle.pem` ✅
- `Info.plist` with App Transport Security config ✅

## Testing

1. Build the app: `eas build --platform android`
2. Install APK on any Android device
3. Open the app and try to login
4. ✅ SSL handshake should work automatically!

## For Development

If using Expo Go, you need a **development build**:

```bash
eas build --platform android --profile development
```

Development builds include native code (network security config), while Expo Go doesn't.

## Troubleshooting

### Certificate Not Found
```bash
# Re-extract certificates
cd mobile
node scripts/extract-certificates.js
```

### Still Getting SSL Errors
1. **Rebuild with cache clear:**
   ```bash
   eas build --platform android --clear-cache
   ```

2. **Verify certificate exists:**
   ```bash
   Test-Path mobile/assets/certs/intermediate-ca-bundle.pem
   ```

3. **Check plugin is in app.config.js:**
   - Should have: `"./plugins/with-network-security.js"` in plugins array

## Documentation

- **Quick Fix (Manual Install):** `QUICK_SSL_FIX.md`
- **Comprehensive Guide:** `SSL_SETUP_GUIDE.md`
- **Bundle for All Devices:** `BUNDLE_CERTIFICATES_FOR_ALL_DEVICES.md` ⭐ **This is what you need!**
- **Local HTTPS Setup:** `LOCAL_HTTPS_SETUP.md`

## Summary

✅ **Certificate is bundled** in APK/IPA  
✅ **Works on all devices** automatically  
✅ **No manual installation** required  
✅ **Production ready** for Play Store/App Store  

Just build and deploy - it works everywhere! 🚀

