# SSL Certificate Setup - Summary

## What Was Done

1. ✅ **Certificate Extraction Script** (`scripts/extract-certificates.js`)
   - Extracts certificates from PKCS7 format
   - Copies CA bundle to `assets/certs/` for app use

2. ✅ **Android Network Security Plugin** (`plugins/with-network-security.js`)
   - Configures Android to trust user-installed certificates
   - Allows intermediate CA certificates to be trusted
   - Added to `app.config.js`

3. ✅ **Documentation Created:**
   - `QUICK_SSL_FIX.md` - Fastest solution (install cert on device)
   - `SSL_SETUP_GUIDE.md` - Comprehensive guide
   - `LOCAL_HTTPS_SETUP.md` - Local HTTPS server setup

## Quick Start (Choose One)

### Option 1: Install Certificate on Device (Fastest - 5 minutes)

1. Transfer `mobile/assets/certs/intermediate-ca-bundle.pem` to your Android device
2. Install it: Settings → Security → Install from storage
3. Test your APK - SSL errors should be resolved

**See `QUICK_SSL_FIX.md` for detailed steps**

### Option 2: Build APK with Network Security Config

1. Install dependencies:
   ```bash
   cd mobile
   npm install @expo/config-plugins --save-dev
   ```

2. Create development build:
   ```bash
   eas build --platform android --profile development
   ```

3. The APK will trust user-installed certificates

**See `SSL_SETUP_GUIDE.md` for details**

### Option 3: Set Up Local HTTPS Server

If you want to test with a local HTTPS server:

1. Follow `LOCAL_HTTPS_SETUP.md`
2. Update `.env`: `EXPO_PUBLIC_API_URL=https://YOUR_IP:8443`
3. Install certificate on device

## Files Created/Modified

### New Files:
- `mobile/scripts/extract-certificates.js` - Certificate extraction script
- `mobile/plugins/with-network-security.js` - Expo config plugin
- `mobile/assets/certs/intermediate-ca-bundle.pem` - Extracted CA bundle
- `mobile/QUICK_SSL_FIX.md` - Quick fix guide
- `mobile/SSL_SETUP_GUIDE.md` - Comprehensive guide
- `mobile/LOCAL_HTTPS_SETUP.md` - Local HTTPS setup

### Modified Files:
- `mobile/app.config.js` - Added network security plugin

## Certificate Location

- **Original certificates:** `mobile/STAR.inspect360.ai_cert/`
- **Extracted for app:** `mobile/assets/certs/`

## Next Steps

1. **For immediate testing:** Use Option 1 (install cert on device)
2. **For production APK:** Use Option 2 (build with network security config)
3. **For development:** Use Option 3 (local HTTPS server)

## Important Notes

⚠️ **The best long-term solution is to fix the server-side SSL configuration:**
- Update your server (nginx/Apache) to include the full certificate chain
- This ensures all clients (not just mobile) can connect without issues
- See `deployment/nginx.conf` for reference

✅ **The mobile app is now configured to:**
- Trust system certificates
- Trust user-installed certificates (for intermediate CAs)
- Work with `*.inspect360.ai` domains

## Troubleshooting

If you still get SSL errors:

1. Verify certificate is installed: Settings → Security → Trusted credentials
2. Clear app data and try again
3. Check that `EXPO_PUBLIC_API_URL` is set correctly in `.env`
4. For production, consider fixing server-side SSL configuration

## Support

- See `QUICK_SSL_FIX.md` for immediate solutions
- See `SSL_SETUP_GUIDE.md` for detailed explanations
- See `LOCAL_HTTPS_SETUP.md` for local development setup

