# Server Connection Fixes - Complete Guide

## Issues Found & Fixed

### ✅ 1. CORS Configuration (FIXED)
**Problem**: Server only allowed localhost origins, blocking `https://portal.inspect360.ai`

**Fix Applied**: Updated `server/index.ts` to:
- Add `https://portal.inspect360.ai` to allowed origins
- Allow production domain in both development and production modes

### ✅ 2. Session Cookie Security (FIXED)
**Problem**: Session cookies had `secure: false` even in production, causing issues with HTTPS

**Fix Applied**: Updated `server/auth.ts` to:
- Auto-detect production environment
- Set `secure: true` for HTTPS connections
- Support cookie domain configuration via `COOKIE_DOMAIN` env variable

### ⚠️ 3. SSL Certificate Issue (NEEDS SERVER ACTION)
**Problem**: `ERR_CERT_DATE_INVALID` - SSL certificate is expired or invalid

**Action Required on Server**:
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate if expired
sudo certbot renew

# Force renewal if needed
sudo certbot renew --force-renewal

# Reload nginx
sudo systemctl reload nginx
```

### ⚠️ 4. Environment Variables (NEEDS UPDATE ON SERVER)
**Problem**: `BASE_URL` is set to `http://localhost:5005` in production

**Action Required**: Update server's `.env` file:
```env
# Change this:
BASE_URL=http://localhost:5005

# To this:
BASE_URL=https://portal.inspect360.ai

# Also ensure:
NODE_ENV=production
```

### ⚠️ 5. Nginx Port Mismatch (CHECK)
**Problem**: nginx.conf shows port 5000, but server runs on 5005

**Check**: Verify nginx proxy_pass matches your server port:
- If server runs on 5005, update nginx.conf:
  ```nginx
  proxy_pass http://localhost:5005;
  ```

## Mobile App Configuration

**Required**: Create/update `mobile/.env`:
```env
EXPO_PUBLIC_API_URL=https://portal.inspect360.ai
```

**Then rebuild the mobile app** after updating.

## Web App

The web app uses relative URLs (`/api/...`), so it automatically works if served from the same domain. No changes needed.

## Testing Checklist

After applying fixes:

1. ✅ **Server CORS** - Fixed in code
2. ✅ **Session Cookies** - Fixed in code  
3. ⚠️ **SSL Certificate** - Renew on server
4. ⚠️ **BASE_URL** - Update server .env
5. ⚠️ **Nginx Port** - Verify matches server port
6. ⚠️ **Mobile .env** - Set EXPO_PUBLIC_API_URL

## Quick Fix Commands (Run on Server)

```bash
# 1. Update environment variables
cd /path/to/your/server
nano .env
# Change BASE_URL to https://portal.inspect360.ai
# Set NODE_ENV=production

# 2. Renew SSL certificate
sudo certbot renew --force-renewal
sudo systemctl reload nginx

# 3. Restart Node.js server
pm2 restart inspect360
# or
systemctl restart inspect360
```

## Verification

After fixes, test:
1. Web app login at `https://portal.inspect360.ai`
2. Mobile app login (with updated .env)
3. Check browser console for CORS errors
4. Check server logs for connection errors

