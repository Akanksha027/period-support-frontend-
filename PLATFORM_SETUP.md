# Platform Setup Guide for iOS and Android

This guide will help you set up and build the Period Tracker app for both iOS and Android platforms.

## Prerequisites

### For iOS Development:
- macOS (required for iOS development)
- Xcode (latest version recommended)
- CocoaPods installed: `sudo gem install cocoapods`
- Apple Developer Account (for device testing and App Store deployment)

### For Android Development:
- Android Studio (latest version)
- Java Development Kit (JDK) 11 or higher
- Android SDK (installed via Android Studio)

### Common Requirements:
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- EAS CLI (for building): `npm install -g eas-cli`

## Installation

1. Install dependencies:
```bash
cd priod-support-frontend
npm install
```

2. For iOS, install CocoaPods:
```bash
cd ios
pod install
cd ..
```

## Configuration

### Environment Variables

Create a `.env` file in the `priod-support-frontend` directory:

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### App Configuration

The app is configured in `app.json`:
- **iOS Bundle Identifier**: `com.periodtracker.app`
- **Android Package**: `com.periodtracker.app`

You may need to change these to match your organization/developer account.

## Running the App

### Development Mode

#### iOS Simulator:
```bash
npm run ios
```

#### Android Emulator:
```bash
npm run android
```

#### Both Platforms:
```bash
npm start
```
Then press `i` for iOS or `a` for Android.

### Building for Production

#### Using EAS Build (Recommended):

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Configure EAS:
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

6. Build for both:
```bash
eas build --platform all
```

#### Local Builds:

**iOS:**
```bash
npx expo run:ios
```

**Android:**
```bash
npx expo run:android
```

## Platform-Specific Features

### iOS
- Uses native date picker with spinner display
- Tab bar height adjusted for iOS safe areas
- Status bar style set to 'dark' for better visibility
- Supports tablets (iPad)

### Android
- Uses native date picker with default display
- Tab bar height optimized for Android
- Status bar style set to 'auto'
- Edge-to-edge display enabled
- Keyboard layout mode set to 'pan' for better UX

## Known Platform Differences

1. **Date Picker**: 
   - iOS: Spinner style
   - Android: Default calendar style

2. **Keyboard Handling**:
   - iOS: Uses 'padding' behavior
   - Android: Uses 'height' behavior

3. **Tab Bar**:
   - iOS: 85px height with 25px bottom padding
   - Android: 60px height with 8px bottom padding

4. **Status Bar**:
   - iOS: Dark style
   - Android: Auto style

## Troubleshooting

### iOS Issues:

1. **Build fails with CocoaPods error**:
   ```bash
   cd ios
   pod deintegrate
   pod install
   cd ..
   ```

2. **Simulator not opening**:
   - Make sure Xcode is installed and updated
   - Open Xcode and accept license agreements
   - Run: `sudo xcode-select --switch /Applications/Xcode.app`

### Android Issues:

1. **Build fails with Gradle error**:
   ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

2. **Emulator not found**:
   - Open Android Studio
   - Go to Tools > Device Manager
   - Create a new virtual device

3. **Metro bundler issues**:
   ```bash
   npm start -- --reset-cache
   ```

### Common Issues:

1. **Module not found errors**:
   ```bash
   rm -rf node_modules
   npm install
   ```

2. **Cache issues**:
   ```bash
   npm start -- --clear
   ```

3. **Expo CLI issues**:
   ```bash
   npm install -g expo-cli@latest
   ```

## Testing

### iOS Testing:
- Use iOS Simulator for development
- Test on physical device for production testing
- Use TestFlight for beta testing

### Android Testing:
- Use Android Emulator for development
- Test on physical device for production testing
- Use Google Play Internal Testing for beta testing

## Deployment

### iOS (App Store):
1. Build with EAS: `eas build --platform ios --profile production`
2. Submit to App Store: `eas submit --platform ios`

### Android (Google Play):
1. Build with EAS: `eas build --platform android --profile production`
2. Submit to Google Play: `eas submit --platform android`

## Support

For issues specific to:
- **Expo**: Check [Expo Documentation](https://docs.expo.dev/)
- **React Native**: Check [React Native Documentation](https://reactnative.dev/)
- **Clerk**: Check [Clerk Documentation](https://clerk.com/docs)

