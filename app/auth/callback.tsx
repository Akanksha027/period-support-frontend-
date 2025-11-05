import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function AuthCallback() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    // Wait a moment for Clerk to process the OAuth callback
    const timer = setTimeout(() => {
      if (isSignedIn) {
        router.replace('/choose-login-type');
      } else {
        router.replace('/(auth)/sign-in');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isSignedIn, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

