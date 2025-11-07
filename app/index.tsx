import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import {
  getUserInfo,
  getSettings,
  setClerkTokenGetter,
  UserInfo,
  loadStoredViewMode,
  setViewMode,
} from '../lib/api';

export default function Index() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [viewMode, setViewModeState] = useState<'SELF' | 'OTHER' | null>(null);
  const [modeReady, setModeReady] = useState(false);
  const [viewerAccessRevoked, setViewerAccessRevoked] = useState(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  useEffect(() => {
    const initMode = async () => {
      const stored = await loadStoredViewMode();
      if (stored) {
        await setViewMode(stored);
        setViewModeState(stored);
      } else {
        await setViewMode(null);
        setViewModeState(null);
      }
      setModeReady(true);
    };

    initMode();
  }, []);

  // Check user type and onboarding status
  useEffect(() => {
    const checkUserTypeAndOnboarding = async () => {
      if (!isLoaded || !isSignedIn || !user || !getToken || !modeReady || viewerAccessRevoked) {
        setLoading(false);
        return;
      }

      if (viewMode === null) {
        setUserInfo(null);
        setHasCompletedOnboarding(false);
        setLoading(false);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const info = await getUserInfo();
        const activeMode = viewMode;

        if (activeMode === 'OTHER') {
          if (info.userType !== 'OTHER' || !info.viewedUser) {
            Alert.alert(
              'Access Removed',
              'The account you were viewing is no longer sharing cycle data.'
            );
            await setViewMode(null);
            setViewModeState(null);
            setViewerAccessRevoked(true);
            setUserInfo(null);
            return;
          }

          await setViewMode('OTHER');
          setViewModeState('OTHER');
          setUserInfo(info);
          setHasCompletedOnboarding(true);
          return;
        }

        if (info) {
          if (info.userType === 'OTHER' && info.viewedUser) {
            await setViewMode('OTHER');
            setViewModeState('OTHER');
            setUserInfo(info);
            setHasCompletedOnboarding(true);
            return;
          }

          await setViewMode('SELF');
          setViewModeState('SELF');
          setUserInfo(info);

          const settings = await getSettings();
          const hasOnboarding = settings?.birthYear || settings?.lastPeriodDate;
          setHasCompletedOnboarding(!!hasOnboarding);
        } else {
          await setViewMode(null);
          setViewModeState(null);
          setUserInfo(null);
        }
      } catch (error: any) {
        if (viewMode === 'OTHER' && error?.response?.status === 404) {
          Alert.alert(
            'Access Removed',
            'The account you were viewing is no longer sharing cycle data.'
          );
          await setViewMode(null);
          setViewModeState(null);
          setViewerAccessRevoked(true);
          setUserInfo(null);
          return;
        }

        console.error('[Index] Error checking user type:', error);
        Alert.alert(
          'Let’s confirm your login type',
          'Please choose whether you are logging in for yourself or someone else.'
        );
        await setViewMode(null);
        setViewModeState(null);
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };

    if (isLoaded && isSignedIn && modeReady && !viewerAccessRevoked) {
      checkUserTypeAndOnboarding();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
    } else if (viewerAccessRevoked) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, user, getToken, modeReady, viewMode, viewerAccessRevoked]);

  // Show loading while checking auth state and user type
  if (!isLoaded || !modeReady || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (viewerAccessRevoked) {
    return <Redirect href="/choose-login-type" />;
  }

  // If not signed in, redirect to login screen
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // If user info is loaded
  if (userInfo) {
    // If user is OTHER type, route to viewer-tabs (view-only mode)
    if (userInfo.userType === 'OTHER') {
      return <Redirect href="/(viewer-tabs)/insights" />;
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
