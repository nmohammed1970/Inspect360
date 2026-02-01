# SSL Certificate Setup Guide

This guide explains how to configure the mobile app to work with SSL certificates, especially when intermediate certificates are missing.

## Problem

Your domain `*.inspect360.ai` is missing intermediate SSL certificates, causing SSL handshake errors when the mobile app tries to connect.

## Solution Options

### Option 1: Install Intermediate Certificates on Device (Recommended for Testing)

For Android devices, you can install the intermediate certificates directly on the device:

1. **Copy the CA bundle to your device:**
   - The certificate file is located at: `mobile/assets/certs/intermediate-ca-bundle.pem`
   - Transfer this file to your Android device

2. **Install on Android:**
   - Go to Settings → Security → Encryption & credentials → Install from storage
   - Select the `intermediate-ca-bundle.pem` file
   - Name it "Inspect360 Intermediate CA"
   - Install it as a "CA certificate"

3. **Verify installation:**
   - The certificate should now be trusted by the system
   - Try connecting to `https://portal.inspect360.ai` again

### Option 2: Use Local HTTPS Server (For Development)

If you want to test with a local HTTPS server:

1. **Set up a local HTTPS server** (see `LOCAL_HTTPS_SETUP.md`)

2. **Update your `.env` file:**
   ```
   EXPO_PUBLIC_API_URL=https://YOUR_LOCAL_IP:8443
   ```

3. **Install the self-signed certificate on your device** (same process as Option 1)

### Option 3: Build Development Build with Network Security Config

For production APKs, you need to create a development build that includes the network security configuration:

1. **Install required dependencies:**
   ```bash
   cd mobile
   npm install @expo/config-plugins --save-dev
   ```

2. **The config plugin is already set up** in `app.config.js`

3. **Create a development build:**
   ```bash
   # Install EAS CLI if not already installed
   npm install -g eas-cli
   
   # Login to Expo
   eas login
   
   # Build for Android
   eas build --platform android --profile development
   ```

4. **The network security config will:**
   - Trust system certificates
   - Trust user-installed certificates (for intermediate CAs)
   - Allow connections to `*.inspect360.ai` domains

## Certificate Files

The SSL certificates are located in:
- `mobile/STAR.inspect360.ai_cert/` - Original certificate files
- `mobile/assets/certs/` - Extracted certificates for app use

## Troubleshooting

### SSL Handshake Error Still Occurs

1. **Check certificate installation:**
   - Android: Settings → Security → Encryption & credentials → Trusted credentials
   - Look for "Inspect360 Intermediate CA" or "Sectigo" certificates

2. **Clear app data:**
   - Sometimes cached SSL state causes issues
   - Clear app data and try again

3. **Check API URL:**
   - Ensure `EXPO_PUBLIC_API_URL` is set correctly in `.env`
   - For production: `https://portal.inspect360.ai`
   - For local: `https://YOUR_IP:8443`

### Certificate Extraction Failed

If the certificate extraction script fails:

1. **Install OpenSSL** (optional, for PKCS7 extraction):
   - Windows: Download from https://slproweb.com/products/Win32OpenSSL.html
   - Or use Git Bash which includes OpenSSL

2. **Manual extraction:**
   - The CA bundle (`STAR.inspect360.ai.ca-bundle`) is already in PEM format
   - Copy it to `mobile/assets/certs/intermediate-ca-bundle.pem`

## Production Deployment

For production APKs distributed via Play Store:

1. **Fix the server-side SSL configuration:**
   - Ensure your server includes the full certificate chain
   - Update nginx/Apache to include intermediate certificates
   - See `deployment/nginx.conf` for reference

2. **Or use the development build approach:**
   - The network security config will trust user-installed certificates
   - Users can install the intermediate CA if needed

## Additional Resources

- [Android Network Security Config](https://developer.android.com/training/articles/security-config)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [SSL Certificate Chain](https://www.ssl.com/article/what-is-an-ssl-certificate-chain/)

