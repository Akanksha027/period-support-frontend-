import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { getUserInfo, getSettings, setClerkTokenGetter, UserInfo } from '../lib/api';

export default function Index() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Check user type and onboarding status
  useEffect(() => {
    const checkUserTypeAndOnboarding = async () => {
      if (!isLoaded || !isSignedIn || !user || !getToken) {
        setLoading(false);
        return;
      }

      try {
        // Get token first
        const token = await getToken();
        if (!token) {
          setLoading(false);
          return;
        }

        // Get user info from database
        const info = await getUserInfo();
        if (info) {
          setUserInfo(info);

          // If user is SELF type, check onboarding status
          if (info.userType === 'SELF') {
            const settings = await getSettings();
            const hasOnboarding = settings?.birthYear || settings?.lastPeriodDate;
            setHasCompletedOnboarding(!!hasOnboarding);
          } else {
            // For OTHER users, they can access the app directly (view-only mode)
            setHasCompletedOnboarding(true);
          }
        }
      } catch (error: any) {
        console.error('[Index] Error checking user type:', error);
        // If error, assume user needs to choose login type
      } finally {
        setLoading(false);
      }
    };

    if (isLoaded && isSignedIn) {
      checkUserTypeAndOnboarding();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, user, getToken]);

  // Show loading while checking auth state and user type
  if (!isLoaded || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If not signed in, redirect to login screen
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // If user info is loaded
  if (userInfo) {
    // If user is OTHER type, route to tabs (view-only mode)
    if (userInfo.userType === 'OTHER') {
      return <Redirect href="/(tabs)/home" />;
    }

    // If user is SELF type
    if (userInfo.userType === 'SELF') {
      // Check onboarding status
      if (hasCompletedOnboarding) {
        return <Redirect href="/(tabs)/home" />;
      } else {
        return <Redirect href="/onboarding" />;
      }
    }
  }

  // If user doesn't exist in database yet, show choose login type screen
  // This handles new users who haven't chosen their login type
  return <Redirect href="/choose-login-type" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
