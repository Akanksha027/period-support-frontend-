import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading while checking auth state
  if (!isLoaded) {
    return null;
  }

  // If user is already signed in, redirect to choose login type
  if (isSignedIn) {
    return <Redirect href="/choose-login-type" />;
  }

  // If not signed in, show auth screens
  return <Stack screenOptions={{ headerShown: false }} />;
}

