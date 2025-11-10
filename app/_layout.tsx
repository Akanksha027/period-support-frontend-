import React from 'react';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-reanimated';

// Complete the web browser session on native
WebBrowser.maybeCompleteAuthSession();

const extra =
  ((Constants as any)?.expoConfig?.extra as any) ||
  ((Constants as any)?.manifest?.extra as any) ||
  ((Constants as any)?.manifest2?.extra as any) ||
  {};

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  extra?.CLERK_PUBLISHABLE_KEY ||
  '';

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk Publishable Key. Please add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file');
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
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
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: Platform.OS === 'ios',
          }}
        />
        <Stack.Screen
          name="choose-login-type"
          options={{
            headerShown: Platform.OS === 'ios',
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login-for-other" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="home" />
        <Stack.Screen name="home-for-other" />
        <Stack.Screen name="(viewer-tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'auto'} />
    </ClerkProvider>
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
