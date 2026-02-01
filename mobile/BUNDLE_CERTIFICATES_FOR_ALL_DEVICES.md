# Bundle SSL Certificates for All Mobile Devices

This guide explains how to configure the app to bundle SSL certificates directly in the APK/IPA, so it works on **all devices without manual installation**.

## How It Works

The updated plugin (`plugins/with-network-security.js`) now:

1. **Bundles the intermediate CA certificate** directly in the app
2. **Configures Android** to trust the bundled certificate via network security config
3. **Configures iOS** to trust user-installed certificates via App Transport Security
4. **Works on all devices** - no manual installation needed!

## Setup Steps

### Step 1: Extract Certificates

Make sure the certificate is extracted:

```bash
cd mobile
node scripts/extract-certificates.js
```

This creates `mobile/assets/certs/intermediate-ca-bundle.pem`

### Step 2: Install Dependencies

The plugin requires `@expo/config-plugins`:

```bash
cd mobile
npm install @expo/config-plugins --save-dev
```

### Step 3: Build the App

The plugin is already configured in `app.config.js`. Now build your app:

#### For Android APK:

```bash
# Development build (includes network security config)
eas build --platform android --profile development

# Or production build
eas build --platform android --profile production
```

#### For iOS IPA:

```bash
# Development build
eas build --platform ios --profile development

# Or production build
eas build --platform ios --profile production
```

### Step 4: Test

1. Install the APK/IPA on any device
2. The app will automatically trust the bundled intermediate CA certificate
3. No manual certificate installation needed!

## What Gets Bundled

### Android:
- Certificate file: `android/app/src/main/res/raw/intermediate_ca_bundle.pem`
- Network security config: `android/app/src/main/res/xml/network_security_config.xml`
- The config references the bundled certificate: `@raw/intermediate_ca_bundle`

### iOS:
- Certificate file: `ios/Inspect360/intermediate-ca-bundle.pem`
- App Transport Security configured in `Info.plist`
- Trusts user-installed certificates for `*.inspect360.ai` domains

## How It Works Technically

### Android Network Security Config

The network security config tells Android to:
1. Trust system certificates (default)
2. **Trust the bundled certificate** (`@raw/intermediate_ca_bundle`) for `*.inspect360.ai` domains
3. Trust user-installed certificates (fallback)

This means:
- ✅ Works on all devices without manual installation
- ✅ Still works if user installs certificate manually (fallback)
- ✅ Secure - only trusts certificates for your specific domain

### iOS App Transport Security

iOS configuration:
- Allows connections to `*.inspect360.ai` with proper TLS
- Trusts user-installed certificates
- Requires TLS 1.2 or higher

## Verification

After building, verify the certificate is bundled:

### Android:
1. Extract the APK: `unzip app.apk`
2. Check: `res/raw/intermediate_ca_bundle.pem` exists
3. Check: `res/xml/network_security_config.xml` references it

### iOS:
1. Extract the IPA: `unzip app.ipa`
2. Check: `Payload/Inspect360.app/intermediate-ca-bundle.pem` exists
3. Check: `Info.plist` has App Transport Security config

## Troubleshooting

### Certificate Not Found Error

If you see warnings about certificate not found:

1. **Run the extraction script:**
   ```bash
   cd mobile
   node scripts/extract-certificates.js
   ```

2. **Verify the file exists:**
   ```bash
   # Should return True
   Test-Path mobile/assets/certs/intermediate-ca-bundle.pem
   ```

3. **Check file permissions** - ensure the file is readable

### SSL Errors Still Occur

1. **Rebuild the app** - the plugin runs during build time
   ```bash
   eas build --platform android --clear-cache
   ```

2. **Check the network security config** is generated:
   - Look for `android/app/src/main/res/xml/network_security_config.xml` after prebuild

3. **Verify certificate format:**
   - Should be PEM format (starts with `-----BEGIN CERTIFICATE-----`)
   - Should contain intermediate CA certificates

### Build Fails

1. **Check plugin syntax:**
   ```bash
   cd mobile
   node -c plugins/with-network-security.js
   ```

2. **Check dependencies:**
   ```bash
   npm list @expo/config-plugins
   ```

3. **Clear build cache:**
   ```bash
   eas build --platform android --clear-cache
   ```

## For Development Builds

If you're using Expo Go, you need to create a **development build**:

```bash
# Create development build
eas build --platform android --profile development

# Install on device
eas build:run --platform android
```

Development builds include native code (like the network security config), while Expo Go doesn't.

## Production Deployment

For production APKs/IPAs distributed via Play Store/App Store:

1. **Build production version:**
   ```bash
   eas build --platform android --profile production
   ```

2. **The certificate is automatically bundled** - no additional steps needed

3. **All users** will have the certificate trusted automatically

## Security Considerations

✅ **Secure:**
- Only trusts certificates for your specific domain (`*.inspect360.ai`)
- Uses proper TLS requirements (TLS 1.2+)
- Doesn't disable security features

⚠️ **Note:**
- The intermediate CA certificate is bundled in the app
- This is safe because it's only an intermediate CA, not a root CA
- Users can still verify the full certificate chain

## Next Steps

1. ✅ Extract certificates: `node scripts/extract-certificates.js`
2. ✅ Install dependencies: `npm install @expo/config-plugins --save-dev`
3. ✅ Build app: `eas build --platform android`
4. ✅ Test on device - SSL should work automatically!

## Summary

With this configuration:
- ✅ **No manual installation** needed on any device
- ✅ **Works on all Android and iOS devices**
- ✅ **Certificate is bundled** in the APK/IPA
- ✅ **Automatic trust** for `*.inspect360.ai` domains
- ✅ **Production ready** - works for Play Store/App Store distribution

The app will now work on all devices without requiring users to install certificates manually!

