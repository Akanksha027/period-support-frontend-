import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading while checking auth state
  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If signed in, redirect to choose login type page
  if (isSignedIn) {
    return <Redirect href="/choose-login-type" />;
  }

  // If not signed in, redirect to login screen
  return <Redirect href="/(auth)/sign-in" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

