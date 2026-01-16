# Inspect360 Mobile App

React Native mobile application for inspectors using Expo.

## Features

- **Authentication**: Login with email/password, session management
- **Inspections**: View assigned inspections, capture inspection data, review and submit
- **Maintenance**: View and create maintenance requests
- **Profile**: View and manage profile information
- **Asset Inventory**: View property asset inventory
- **Offline Support**: Queue requests when offline, sync when online

## Setup

1. Install dependencies:
```bash
npm install --legacy-peer-deps
```

2. Configure environment variables:
Create a `.env` file in the mobile directory:
```
EXPO_PUBLIC_API_URL=http://localhost:5000
```

**Important for Mobile Devices/Emulators:**
- When running on a physical device or Android/iOS emulator, `localhost` won't work
- You need to use your computer's IP address instead
- Find your IP address:
  - Windows: Run `ipconfig` and look for "IPv4 Address"
  - Mac/Linux: Run `ifconfig` or `ip addr`
- Update `.env` with: `EXPO_PUBLIC_API_URL=http://YOUR_IP_ADDRESS:5000`
  - Example: `EXPO_PUBLIC_API_URL=http://192.168.1.100:5000`

3. **Start the Backend Server First:**
   - In the root directory (`D:\Inspect360App`), run:
   ```bash
   npm run dev
   ```
   - This starts the backend server on `http://localhost:5000`
   - **The backend must be running before you can login!**

4. Start the mobile app:
```bash
npm start
```

## Running on Devices

### iOS
```bash
npm run ios
```

### Android
```bash
npm run android
```

### Web (Limited Support)
```bash
npm run web
```
Note: Some features (camera, native modules) won't work on web.

## Building for Production

### Using EAS Build

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Configure the project:
```bash
eas build:configure
```

4. Build for iOS:
```bash
eas build --platform ios
```

5. Build for Android:
```bash
eas build --platform android
```

## Project Structure

```
mobile/
├── src/
│   ├── screens/          # Screen components
│   ├── components/       # Reusable components
│   ├── navigation/       # Navigation setup
│   ├── services/         # API services
│   ├── hooks/            # Custom hooks
│   ├── contexts/         # Context providers
│   ├── utils/            # Utilities
│   └── types/            # TypeScript types
├── App.tsx               # Root component
├── app.config.js         # Expo configuration
└── package.json
```

## API Integration

The app connects to the existing Inspect360 backend API. Make sure the backend is running and accessible at the URL specified in `EXPO_PUBLIC_API_URL`.

## Troubleshooting

### Connection Refused Error
- Make sure the backend server is running: `npm run dev` in the root directory
- Check that the API URL in `.env` is correct
- For mobile devices, use your computer's IP address instead of `localhost`

### Login Not Working
- Verify backend server is running on port 5000
- Check network connectivity
- Ensure API URL is correctly configured

## Offline Support

The app includes offline queue functionality:
- Inspection data is saved locally when offline
- Requests are queued and synced when network is available
- Network status is displayed in the app

## Notes

- The app uses session-based authentication (cookies)
- All API endpoints match the web application
- Camera and photo capture require device permissions
