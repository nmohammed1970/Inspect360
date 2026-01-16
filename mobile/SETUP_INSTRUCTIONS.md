# Quick Setup Instructions

## Step 1: Start the Backend Server

**IMPORTANT:** The backend server must be running before you can login!

1. Open a terminal in the root directory: `D:\Inspect360App`
2. Run:
   ```bash
   npm run dev
   ```
3. Wait for the message: `✅ Server started successfully on http://localhost:5000`

## Step 2: Configure API URL

### For Web (localhost):
The default `http://localhost:5000` should work.

### For Mobile Device/Emulator:
You need to use your computer's IP address instead of `localhost`.

1. Find your IP address:
   - Windows: Run `ipconfig` in PowerShell
   - Look for "IPv4 Address" (usually starts with 192.168.x.x or 10.x.x.x)
   - Your IP appears to be: `192.168.56.1`

2. Create or update `.env` file in the `mobile` directory:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.56.1:5000
   ```

3. Restart the Expo development server:
   ```bash
   npm start -- --clear
   ```

## Step 3: Test the Connection

1. Make sure backend is running (Step 1)
2. Start the mobile app: `npm start`
3. Try logging in with your credentials

## Troubleshooting

### "Connection Refused" Error
- ✅ Backend server is running? Check terminal for `✅ Server started successfully`
- ✅ Correct API URL? Check `.env` file
- ✅ Same network? Device and computer must be on same WiFi network
- ✅ Firewall? Windows Firewall might be blocking port 5000

### Still Not Working?
1. Check backend is accessible: Open `http://localhost:5000/api/auth/user` in browser
2. For mobile, try: `http://YOUR_IP:5000/api/auth/user` (replace YOUR_IP)
3. If browser works but mobile doesn't, check firewall settings

