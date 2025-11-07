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
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);

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
          console.log('[Index] initMode waiting for signed-in user');
          setViewModeState(null);
          return;
        }

        const email = primaryEmail;

        if (!email) {
          console.log('[Index] initMode missing email');
          setViewModeState(null);
          return;
        }

        const stored = await loadStoredViewModeRecord(email);
        if (stored) {
          console.log('[Index] initMode loaded stored mode', stored.mode);
          setViewModeState(stored.mode);
        } else {
          console.log('[Index] initMode no stored mode for email');
          await setViewMode('SELF', { email, persist: false });
          setViewModeState('SELF');
        }
      } catch (error) {
        console.error('[Index] Failed to initialise view mode:', error);
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

      try {
        const token = await getToken();
        if (!token) {
          console.log('[Index] checkUserType no token');
          setLoading(false);
          setInitialCheckComplete(true);
          return;
        }

        const info = await getUserInfo();
        let effectiveInfo = info;
        let activeMode = viewMode;

        if (!activeMode && primaryEmail) {
          // First assume SELF and see if backend confirms
          await setViewMode('SELF', { email: primaryEmail, persist: false });
          setViewModeState('SELF');
          effectiveInfo = await getUserInfo();

          if (effectiveInfo?.userType === 'SELF') {
            await setViewMode('SELF', { email: primaryEmail, persist: true });
            activeMode = 'SELF';
          } else {
            // Not a self account; try OTHER
            await setViewMode('OTHER', { email: primaryEmail, persist: false });
            setViewModeState('OTHER');
            effectiveInfo = await getUserInfo();

            if (effectiveInfo?.userType === 'OTHER' && effectiveInfo.viewedUser) {
              await setViewMode('OTHER', {
                email: primaryEmail,
                viewedUserId: effectiveInfo.viewedUser.id,
                viewedUserEmail: effectiveInfo.viewedUser.email,
                persist: true,
              });
              activeMode = 'OTHER';
            } else {
              // Fallback to SELF if OTHER attempt failed
              await setViewMode('SELF', { email: primaryEmail, persist: true });
              setViewModeState('SELF');
              activeMode = 'SELF';
              effectiveInfo = await getUserInfo();
            }
          }
        }

        console.log('[Index] checkUserType fetched user info', {
          activeMode,
          apiUserType: effectiveInfo?.userType,
          hasViewedUser: !!effectiveInfo?.viewedUser,
        });

        if (activeMode === 'OTHER') {
          if (!effectiveInfo || effectiveInfo.userType !== 'OTHER' || !effectiveInfo.viewedUser || !primaryEmail) {
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
              viewedUserId: effectiveInfo.viewedUser.id,
              viewedUserEmail: effectiveInfo.viewedUser.email,
              persist: true,
            });
          }
          setViewModeState('OTHER');
          setUserInfo(effectiveInfo);
          setHasCompletedOnboarding(true);
          return;
        }

        if (effectiveInfo) {
          if (effectiveInfo.userType === 'OTHER' && effectiveInfo.viewedUser && primaryEmail) {
            await setViewMode('OTHER', {
              email: primaryEmail,
              viewedUserId: effectiveInfo.viewedUser.id,
              viewedUserEmail: effectiveInfo.viewedUser.email,
              persist: true,
            });
            setViewModeState('OTHER');
            setUserInfo(effectiveInfo);
            setHasCompletedOnboarding(true);
            return;
          }

          if (primaryEmail) {
            await setViewMode('SELF', { email: primaryEmail, persist: true });
          } else {
            await setViewMode('SELF');
          }
          setViewModeState('SELF');
          setUserInfo(effectiveInfo);

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
        setInitialCheckComplete(true);
      }
    };

    if (isLoaded && isSignedIn && modeReady && !viewerAccessRevoked) {
      checkUserTypeAndOnboarding();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
      setInitialCheckComplete(true);
    } else if (viewerAccessRevoked) {
      setLoading(false);
      setInitialCheckComplete(true);
    }
  }, [isLoaded, isSignedIn, user, primaryEmail, getToken, modeReady, viewMode, viewerAccessRevoked]);

  // Show loading while checking auth state and user type
  if (!isLoaded || !modeReady || loading || !initialCheckComplete) {
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
