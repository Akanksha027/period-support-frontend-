import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import {
  getUserInfo,
  getSettings,
  setClerkTokenGetter,
  UserInfo,
  loadStoredViewModeRecord,
  setViewMode,
  ViewMode,
} from '../lib/api';

export default function Index() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode | null>(null);
  const [modeReady, setModeReady] = useState(false);
  const [viewerAccessRevoked, setViewerAccessRevoked] = useState(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  useEffect(() => {
    const initMode = async () => {
      if (!isLoaded) {
        console.log('[Index] initMode skipped because auth not loaded');
        return;
      }

      try {
        if (!isSignedIn || !user) {
          await setViewMode(null);
          setViewModeState(null);
          console.log('[Index] initMode cleared mode because not signed in or user missing');
          return;
        }

        const email = primaryEmail;

        if (!email) {
          await setViewMode(null);
          setViewModeState(null);
          console.log('[Index] initMode cleared mode because email missing');
          return;
        }

        const stored = await loadStoredViewModeRecord(email);
        if (stored) {
          console.log('[Index] initMode loaded stored mode', stored.mode);
          setViewModeState(stored.mode);
        } else {
          await setViewMode(null);
          setViewModeState(null);
          console.log('[Index] initMode no stored mode, defaulting null');
        }
      } catch (error) {
        console.error('[Index] Failed to initialise view mode:', error);
        await setViewMode(null);
        setViewModeState(null);
      } finally {
        setModeReady(true);
      }
    };

    initMode();
  }, [isLoaded, isSignedIn, user, primaryEmail]);

  // Check user type and onboarding status
  useEffect(() => {
    const checkUserTypeAndOnboarding = async () => {
      if (!isLoaded || !isSignedIn || !user || !getToken || !modeReady || viewerAccessRevoked) {
        console.log('[Index] checkUserType early return', {
          isLoaded,
          isSignedIn,
          hasUser: !!user,
          hasTokenGetter: !!getToken,
          modeReady,
          viewerAccessRevoked,
        });
        setLoading(false);
        return;
      }

      if (viewMode === null) {
        console.log('[Index] checkUserType viewMode null -> showing choose login');
        setUserInfo(null);
        setHasCompletedOnboarding(false);
        setLoading(false);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          console.log('[Index] checkUserType no token');
          setLoading(false);
          return;
        }

        const info = await getUserInfo();
        const activeMode = viewMode;
        console.log('[Index] checkUserType fetched user info', {
          activeMode,
          apiUserType: info?.userType,
          hasViewedUser: !!info?.viewedUser,
        });

        if (activeMode === 'OTHER') {
          if (!info || info.userType !== 'OTHER' || !info.viewedUser || !primaryEmail) {
            Alert.alert(
              'Access Removed',
              'The account you were viewing is no longer sharing cycle data.'
            );
            await setViewMode(null, { email: primaryEmail, forgetPersisted: true });
            setViewModeState(null);
            setViewerAccessRevoked(true);
            setUserInfo(null);
            return;
          }

          if (primaryEmail) {
            await setViewMode('OTHER', {
              email: primaryEmail,
              viewedUserId: info.viewedUser.id,
              viewedUserEmail: info.viewedUser.email,
              persist: true,
            });
          }
          setViewModeState('OTHER');
          setUserInfo(info);
          setHasCompletedOnboarding(true);
          return;
        }

        if (info) {
          if (info.userType === 'OTHER' && info.viewedUser && primaryEmail) {
            await setViewMode('OTHER', {
              email: primaryEmail,
              viewedUserId: info.viewedUser.id,
              viewedUserEmail: info.viewedUser.email,
              persist: true,
            });
            setViewModeState('OTHER');
            setUserInfo(info);
            setHasCompletedOnboarding(true);
            return;
          }

          if (primaryEmail) {
            await setViewMode('SELF', { email: primaryEmail, persist: true });
          } else {
            await setViewMode('SELF');
          }
          setViewModeState('SELF');
          setUserInfo(info);

          const settings = await getSettings();
          const hasOnboarding = settings?.birthYear || settings?.lastPeriodDate;
          setHasCompletedOnboarding(!!hasOnboarding);
        } else if (primaryEmail) {
          await setViewMode(null, { email: primaryEmail, forgetPersisted: true });
          setViewModeState(null);
          setUserInfo(null);
        } else {
          await setViewMode(null);
          setViewModeState(null);
          setUserInfo(null);
        }
      } catch (error: any) {
        if (viewMode === 'OTHER' && error?.response?.status === 404 && primaryEmail) {
          Alert.alert(
            'Access Removed',
            'The account you were viewing is no longer sharing cycle data.'
          );
          await setViewMode(null, { email: primaryEmail, forgetPersisted: true });
          setViewModeState(null);
          setViewerAccessRevoked(true);
          setUserInfo(null);
          console.log('[Index] checkUserType OTHER revoked');
          return;
        }

        console.error('[Index] Error checking user type:', error);
        Alert.alert(
          'Let’s confirm your login type',
          'Please choose whether you are logging in for yourself or someone else.'
        );
        if (primaryEmail) {
          await setViewMode(null, { email: primaryEmail, forgetPersisted: true });
        } else {
          await setViewMode(null);
        }
        setViewModeState(null);
        setUserInfo(null);
        console.log('[Index] checkUserType caught error, forcing choose login');
      } finally {
        console.log('[Index] checkUserType finished, clearing loading');
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
  }, [isLoaded, isSignedIn, user, primaryEmail, getToken, modeReady, viewMode, viewerAccessRevoked]);

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
