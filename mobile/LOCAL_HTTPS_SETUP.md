# Local HTTPS Server Setup

This guide explains how to set up a local HTTPS server for testing the mobile app with SSL certificates.

## Prerequisites

- Node.js installed
- SSL certificates in `mobile/STAR.inspect360.ai_cert/` folder
- Backend server running

## Option 1: Using Node.js HTTPS Server

### Step 1: Convert Certificates

The certificates need to be in a format Node.js can use. You'll need:
- Certificate file (`.crt` or `.pem`)
- Private key file (`.key`)

If you only have the PKCS7 bundle, you'll need to extract them using OpenSSL:

```bash
# Extract certificate chain from PKCS7
openssl pkcs7 -inform PEM -in STAR.inspect360.ai_cert/STAR.inspect360.ai.p7b -print_certs -out cert-chain.pem

# Extract the private key (if you have it)
# Note: The private key should be provided separately by your certificate authority
```

### Step 2: Create HTTPS Server Wrapper

Create a file `server/https-server.js`:

```javascript
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load certificates
const certPath = path.join(__dirname, '..', 'mobile', 'STAR.inspect360.ai_cert', 'cert.pem');
const keyPath = path.join(__dirname, '..', 'mobile', 'STAR.inspect360.ai_cert', 'private.key');
const caPath = path.join(__dirname, '..', 'mobile', 'STAR.inspect360.ai_cert', 'STAR.inspect360.ai.ca-bundle');

const options = {
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  ca: fs.readFileSync(caPath),
};

// Your existing Express app
const app = require('./index'); // Adjust path to your Express app

const PORT = 8443;

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server running on https://localhost:${PORT}`);
  console.log(`For mobile devices, use: https://YOUR_IP:${PORT}`);
});
```

### Step 3: Update Mobile App

Update `mobile/.env`:
```
EXPO_PUBLIC_API_URL=https://YOUR_LOCAL_IP:8443
```

Replace `YOUR_LOCAL_IP` with your computer's local IP address (find it with `ipconfig` on Windows or `ifconfig` on Mac/Linux).

## Option 2: Using Nginx as Reverse Proxy

### Step 1: Install Nginx

- Windows: Download from http://nginx.org/en/download.html
- Mac: `brew install nginx`
- Linux: `sudo apt-get install nginx`

### Step 2: Configure Nginx

Create `nginx-local.conf`:

```nginx
server {
    listen 8443 ssl http2;
    server_name localhost;

    # SSL Certificate Configuration
    ssl_certificate D:/Inspect360App/mobile/STAR.inspect360.ai_cert/STAR.inspect360.ai.p7b;
    ssl_certificate_key D:/Inspect360App/mobile/STAR.inspect360.ai_cert/private.key;
    ssl_trusted_certificate D:/Inspect360App/mobile/STAR.inspect360.ai_cert/STAR.inspect360.ai.ca-bundle;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to Node.js backend
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 3: Start Nginx

```bash
# Windows
nginx.exe -c nginx-local.conf

# Mac/Linux
sudo nginx -c /path/to/nginx-local.conf
```

### Step 4: Update Mobile App

Update `mobile/.env`:
```
EXPO_PUBLIC_API_URL=https://YOUR_LOCAL_IP:8443
```

## Option 3: Using mkcert (Easiest for Development)

`mkcert` creates locally-trusted certificates automatically:

### Step 1: Install mkcert

- Windows: Download from https://github.com/FiloSottile/mkcert/releases
- Mac: `brew install mkcert`
- Linux: Follow instructions at https://github.com/FiloSottile/mkcert

### Step 2: Create Local CA

```bash
mkcert -install
```

### Step 3: Generate Certificate

```bash
mkcert localhost 127.0.0.1 YOUR_LOCAL_IP *.inspect360.ai
```

This creates:
- `localhost+3.pem` (certificate)
- `localhost+3-key.pem` (private key)

### Step 4: Use with Node.js

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  cert: fs.readFileSync('localhost+3.pem'),
  key: fs.readFileSync('localhost+3-key.pem'),
};

// Your Express app
const app = require('./index');

https.createServer(options, app).listen(8443, () => {
  console.log('HTTPS Server running on https://localhost:8443');
});
```

## Installing Certificate on Android Device

For any of the above options, you need to install the certificate on your Android device:

1. **Transfer certificate to device:**
   - Email it to yourself, or
   - Use ADB: `adb push certificate.pem /sdcard/Download/`

2. **Install on device:**
   - Settings → Security → Encryption & credentials → Install from storage
   - Select the certificate file
   - Name it (e.g., "Local Dev CA")
   - Install as "CA certificate"

3. **For mkcert certificates:**
   - The root CA is automatically trusted after `mkcert -install`
   - On Android, you still need to install the certificate manually

## Testing

1. **Start your HTTPS server** (one of the options above)

2. **Update mobile app `.env`:**
   ```
   EXPO_PUBLIC_API_URL=https://YOUR_LOCAL_IP:8443
   ```

3. **Install certificate on device** (if using self-signed certs)

4. **Run the mobile app:**
   ```bash
   cd mobile
   npm start
   ```

5. **Test connection:**
   - Try logging in
   - Check for SSL errors in the console

## Troubleshooting

### "Certificate not trusted" error

- Ensure the certificate is installed on the device
- For mkcert, run `mkcert -install` on your computer
- Check that the certificate matches the domain you're connecting to

### "Connection refused" error

- Check that the HTTPS server is running
- Verify the IP address and port in `.env`
- Ensure firewall allows connections on port 8443

### "SSL handshake failed"

- Verify certificate and key files are correct
- Check that the certificate includes the full chain
- Ensure the server is configured to send intermediate certificates

## Security Note

⚠️ **Important:** These local HTTPS setups are for development only. Never use self-signed certificates or local CAs in production.

