# Production Connection Issues - Fix Guide

## Issues Identified

1. **CORS Configuration**: Server doesn't allow `https://portal.inspect360.ai` in production
2. **Session Cookies**: Secure flag not set for HTTPS in production
3. **BASE_URL**: Environment variable set to localhost instead of production URL
4. **SSL Certificate**: Certificate expired or invalid (`ERR_CERT_DATE_INVALID`)

## Fixes Applied

### 1. CORS Configuration (server/index.ts) ✅
- Added `https://portal.inspect360.ai` to allowed origins
- Updated logic to allow production domain in both development and production

### 2. Session Cookie Security (server/auth.ts) ✅
- Auto-detect production environment
- Set `secure: true` for HTTPS connections
- Added support for cookie domain configuration

### 3. Environment Variables Needed

Update your server's `.env` file (on the production server):

```env
# Change from localhost to production URL
BASE_URL=https://portal.inspect360.ai

# Set production mode
NODE_ENV=production

# Optional: Set cookie domain if needed
# COOKIE_DOMAIN=.inspect360.ai
```

### 4. SSL Certificate Issue

The `ERR_CERT_DATE_INVALID` error indicates your SSL certificate is expired or invalid.

**To Fix:**
1. SSH into your server
2. Check certificate expiration:
   ```bash
   sudo certbot certificates
   ```
3. If expired, renew:
   ```bash
   sudo certbot renew
   ```
4. Restart nginx:
   ```bash
   sudo systemctl restart nginx
   ```

**Or if using Let's Encrypt:**
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

## Mobile App Configuration

For the mobile app to connect to production:

1. **Create/Update `mobile/.env` file:**
   ```env
   EXPO_PUBLIC_API_URL=https://portal.inspect360.ai
   ```

2. **Rebuild the app** after updating the environment variable

## Web App Configuration

The web app uses relative URLs (`/api/...`), so it automatically uses the same origin. No configuration needed if the web app is served from `https://portal.inspect360.ai`.

## Testing

After applying fixes:

1. **Test Web App:**
   - Open `https://portal.inspect360.ai`
   - Try logging in
   - Check browser console for errors

2. **Test Mobile App:**
   - Ensure `EXPO_PUBLIC_API_URL=https://portal.inspect360.ai` in `mobile/.env`
   - Rebuild the app
   - Test login functionality

3. **Check Server Logs:**
   - Look for CORS errors
   - Check for authentication errors
   - Verify requests are reaching the server

## Additional Notes

- The server must be running with `NODE_ENV=production` for secure cookies
- Ensure nginx is properly configured to proxy to the Node.js server
- Check firewall rules allow traffic on port 5005 (or your configured port)
- Verify the server is accessible from the internet (not just localhost)

