import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import CustomTabBar from '../../components/CustomTabBar';
import { PhaseProvider } from '../../contexts/PhaseContext';

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Protect tabs - require authentication
  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <PhaseProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide default tab bar
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'AI Chat',
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
          }}
        />
      </Tabs>
    </PhaseProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
