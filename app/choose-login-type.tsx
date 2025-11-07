import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { api, setViewMode } from '@/lib/api';

export default function ChooseLoginTypeScreen() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded, getToken } = useAuth();

  // Show loading while checking auth state
  if (!authLoaded || !userLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Redirect to login if not signed in
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const handleLoginForSelf = async () => {
    await setViewMode('SELF');
    // Check if user has completed onboarding
    // If not, redirect to onboarding screen
    try {
      // Ensure user exists and is loaded
      if (!user || !isSignedIn) {
        router.replace('/onboarding');
        return;
      }

      // Get token from auth
      const token = await getToken();
      if (!token) {
        // If no token, assume onboarding not complete
        router.replace('/onboarding');
        return;
      }

      const email = user.emailAddresses[0]?.emailAddress;
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
          router.replace('/onboarding');
        } else {
          // Other errors, log and redirect to onboarding
          console.error('Error checking onboarding status:', apiError);
          router.replace('/onboarding');
        }
      }
    } catch (error) {
      console.error('Error in handleLoginForSelf:', error);
      // On error, go to onboarding to be safe
      router.replace('/onboarding');
    }
  };

  const handleLoginForOther = () => {
    // Navigate to login for someone else screen
    router.push('/login-for-other');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Choose Login Type</Text>
        <Text style={styles.subtitle}>How would you like to use this app?</Text>

        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.optionButton} onPress={handleLoginForSelf}>
            <Text style={styles.optionTitle}>Login for Yourself</Text>
            <Text style={styles.optionDescription}>
              Track your own period and symptoms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionButton} onPress={handleLoginForOther}>
            <Text style={styles.optionTitle}>Login for Someone Else</Text>
            <Text style={styles.optionDescription}>
              Track periods for someone else
            </Text>
          </TouchableOpacity>
        </View>

        {user && (
          <Text style={styles.userInfo}>
            Signed in as: {user.emailAddresses[0]?.emailAddress}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 48,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    backgroundColor: '#f9f9f9',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  userInfo: {
    marginTop: 32,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
