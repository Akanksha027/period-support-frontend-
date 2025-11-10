import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Platform, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading while checking auth state
  if (!isLoaded) {
    return null;
  }

  // If user is already signed in, redirect to choose login type
  if (isSignedIn) {
    return <Redirect href="/choose-login-type" />;
  }

  // If not signed in, show auth screens
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: Platform.OS === 'ios',
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerBackTitleVisible: false,
        gestureEnabled: Platform.OS === 'ios',
        fullScreenGestureEnabled: true,
        gestureDirection: 'horizontal',
        headerLeft: () =>
          navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.headerBackButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.headerBackContent}>
                <Ionicons name="chevron-back" size={20} color="#000" />
                <Text style={styles.headerBackText}>Back</Text>
              </View>
            </TouchableOpacity>
          ) : null,
      })}
    />
  );
}

const styles = StyleSheet.create({
  headerBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerBackText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
});
