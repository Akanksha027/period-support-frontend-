import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { Redirect, useRouter } from 'expo-router';
import { SignOutButton } from '@/components/SignOutButton';
import { api } from '@/lib/api';

export default function HomeScreen() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded, getToken } = useAuth();
  const router = useRouter();
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user || !isSignedIn || !getToken) return;

      try {
        const token = await getToken();
        if (!token) return;

        // Get user profile to get name
        // Note: GET requests don't have body, so we'll send email/clerkId in query params
        // The backend will decode from token if available
        const response = await api.get('/api/user', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.data?.user) {
          const name = response.data.user.name || 
                      user.firstName || 
                      user.emailAddresses[0]?.emailAddress?.split('@')[0] ||
                      'there';
          setUserName(name);
        } else {
          setUserName(user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'there');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        // Fallback to email or default
        setUserName(user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'there');
      } finally {
        setLoading(false);
      }
    };

    if (userLoaded && user) {
      fetchUserData();
    }
  }, [user, userLoaded, isSignedIn]);

  // Show loading while checking auth state
  if (!authLoaded || !userLoaded || loading) {
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.welcomeText}>
          Welcome, {userName || user?.emailAddresses[0]?.emailAddress?.split('@')[0] || 'there'}! 👋
        </Text>
        <Text style={styles.description}>
          You are successfully logged in. This is your home screen.
        </Text>

        <View style={styles.signOutContainer}>
          <SignOutButton />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000',
  },
  welcomeText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#999',
    marginBottom: 32,
  },
  signOutContainer: {
    marginTop: 32,
  },
});

