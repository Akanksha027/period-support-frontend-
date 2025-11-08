import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { api, setViewMode, loadStoredViewModeRecord, ViewMode } from '@/lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PeriLoader from '../components/PeriLoader';

export default function ChooseLoginTypeScreen() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded, getToken } = useAuth();
  const [checkingSavedMode, setCheckingSavedMode] = React.useState(true);

  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  React.useEffect(() => {
    const redirectIfKnown = async () => {
      console.log('[ChooseLoginType] redirect check start', {
        isSignedIn,
        hasUser: !!user,
        primaryEmail,
      });

      if (!isSignedIn || !user || !primaryEmail) {
        console.log('[ChooseLoginType] no stored mode because missing auth/user/email');
        setCheckingSavedMode(false);
        return;
      }

      const stored = await loadStoredViewModeRecord(primaryEmail);
      console.log('[ChooseLoginType] stored mode record', stored);
      const mode = stored?.mode as ViewMode | null;
      const storedViewedUserId = stored?.viewedUserId;

      if (mode === 'SELF') {
        console.log('[ChooseLoginType] redirecting to self tabs');
        router.replace('/(tabs)/home');
        return;
      }

      if (mode === 'OTHER' && storedViewedUserId) {
        console.log('[ChooseLoginType] redirecting to viewer tabs');
        router.replace('/(viewer-tabs)/insights');
        return;
      }

      console.log('[ChooseLoginType] no stored mode, showing options');
      setCheckingSavedMode(false);
    };

    redirectIfKnown();
  }, [isSignedIn, user, primaryEmail, router]);

  // Show loading while checking auth state
  if (!authLoaded || !userLoaded || checkingSavedMode) {
    console.log('[ChooseLoginType] waiting', {
      authLoaded,
      userLoaded,
      checkingSavedMode,
    });
    return (
      <View style={styles.mainContainer}>
        <LinearGradient
          colors={['#FFC1D6', '#FFB3C6', '#FFA6BA']}
          style={styles.topGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
        >
          <View style={styles.starsContainer}>
            <Text style={[styles.star, styles.star1]}>✦</Text>
            <Text style={[styles.star, styles.star2]}>✦</Text>
            <Text style={[styles.star, styles.star3]}>✦</Text>
          </View>
          <View style={styles.curvedOverlay}>
            <View style={styles.curveShape} />
          </View>
        </LinearGradient>
        <View style={styles.bottomWhite} />
        <View style={styles.loadingContainer}>
          <PeriLoader size="large" />
        </View>
      </View>
    );
  }

  // Redirect to login if not signed in
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const handleLoginForSelf = async () => {
    // Check if user has completed onboarding
    // If not, redirect to onboarding screen
    try {
      // Ensure user exists and is loaded
      if (!user || !isSignedIn) {
        router.replace('/onboarding');
        return;
      }

      const email = primaryEmail;

      // Get token from auth
      const token = await getToken();
      if (!token) {
        // If no token, assume onboarding not complete
        router.replace('/onboarding');
        return;
      }

      const clerkId = user.id;

      // Log for debugging
      console.log('[ChooseLoginType] Checking onboarding with:', {
        email,
        clerkId,
        hasToken: !!token,
      });

      // Check if user has settings (completed onboarding)
      // Include clerkId and email for backend fallback authentication
      try {
        const response = await api.get('/api/user/settings', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            clerkId,
            email,
          },
        });

        if (response.data) {
          const data = response.data;
          // Check if user has completed onboarding (has birthYear or lastPeriodDate)
          const hasCompletedOnboarding = data.settings?.birthYear || data.settings?.lastPeriodDate;

          if (email) {
            await setViewMode('SELF', { email, persist: true });
          } else {
            await setViewMode('SELF');
          }
          
          if (hasCompletedOnboarding) {
            router.replace('/(tabs)/home');
          } else {
            router.replace('/onboarding');
          }
        } else {
          // If no data, assume onboarding not complete
          router.replace('/onboarding');
        }
      } catch (apiError: any) {
        // 401 or 404 means user doesn't have settings yet (not completed onboarding)
        // This is expected for new users
        if (apiError?.response?.status === 401 || apiError?.response?.status === 404) {
          if (email) {
            await setViewMode('SELF', { email, persist: true });
          } else {
            await setViewMode('SELF');
          }
          router.replace('/onboarding');
        } else {
          // Other errors, log and redirect to onboarding
          console.error('Error checking onboarding status:', apiError);
          if (email) {
            await setViewMode('SELF', { email, persist: true });
          } else {
            await setViewMode('SELF');
          }
          router.replace('/onboarding');
        }
      }
    } catch (error) {
      console.error('Error in handleLoginForSelf:', error);
      // On error, go to onboarding to be safe
      if (primaryEmail) {
        await setViewMode('SELF', { email: primaryEmail, persist: true });
      } else {
        await setViewMode('SELF');
      }
      router.replace('/onboarding');
    }
  };

  const handleLoginForOther = () => {
    // Navigate to login for someone else screen
    router.push('/login-for-other');
  };

  return (
    <View style={styles.mainContainer}>
      {/* Top pink gradient section with stars */}
      <LinearGradient
        colors={['#FFC1D6', '#FFB3C6', '#FFA6BA']}
        style={styles.topGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
      >
        {/* Decorative stars - white color */}
        <View style={styles.starsContainer}>
          <Text style={[styles.star, styles.star1]}>✦</Text>
          <Text style={[styles.star, styles.star2]}>✦</Text>
          <Text style={[styles.star, styles.star3]}>✦</Text>
        </View>

        {/* Curved white overlay - curves downward */}
        <View style={styles.curvedOverlay}>
          <View style={styles.curveShape} />
        </View>
      </LinearGradient>

      {/* Bottom white section */}
      <View style={styles.bottomWhite} />

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Choose Login Type</Text>
          <Text style={styles.subtitle}>How would you like to use this app?</Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            <TouchableOpacity style={styles.optionButton} onPress={handleLoginForSelf}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="person" size={32} color="#FF6B9D" />
              </View>
              <Text style={styles.optionTitle}>Login for Yourself</Text>
              <Text style={styles.optionDescription}>
                Track your own period and symptoms
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionButton} onPress={handleLoginForOther}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="people" size={32} color="#FF6B9D" />
              </View>
              <Text style={styles.optionTitle}>Login for Someone Else</Text>
              <Text style={styles.optionDescription}>
                Track periods for someone else
              </Text>
            </TouchableOpacity>
          </View>

          {/* User Info */}
          {user && (
            <Text style={styles.userInfo}>
              Signed in as: {user.emailAddresses[0]?.emailAddress}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  bottomWhite: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#FFFFFF',
  },
  curvedOverlay: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 100,
    overflow: 'hidden',
  },
  curveShape: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    transform: [{ scaleY: 1 }],
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  starsContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  star: {
    position: 'absolute',
    fontSize: 16,
    opacity: 0.6,
    color: '#FFFFFF',
  },
  star1: {
    top: '25%',
    right: '20%',
  },
  star2: {
    top: '35%',
    right: '70%',
  },
  star3: {
    top: '15%',
    left: '15%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    zIndex: 10,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    paddingVertical: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    width: 80,
    height: 80,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '200%',
    height: '200%',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 28,
    textAlign: 'center',
  },
  optionsContainer: {
    width: '100%',
    gap: 14,
    marginBottom: 20,
  },
  optionButton: {
    backgroundColor: '#F9F9F9',
    borderWidth: 2,
    borderColor: '#FF6B9D',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#FF6B9D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFE8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
    textAlign: 'center',
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  userInfo: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});