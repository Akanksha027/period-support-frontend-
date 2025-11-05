import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import 'react-native-reanimated';

// Complete the web browser session on native
WebBrowser.maybeCompleteAuthSession();

const extra =
  ((Constants as any)?.expoConfig?.extra as any) ||
  ((Constants as any)?.manifest?.extra as any) ||
  ((Constants as any)?.manifest2?.extra as any) ||
  {};

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  extra?.CLERK_PUBLISHABLE_KEY ||
  '';

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk Publishable Key. Please add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file');
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="choose-login-type" />
        <Stack.Screen name="login-for-other" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="home" />
        <Stack.Screen name="home-for-other" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="auto" />
    </ClerkProvider>
  );
}
