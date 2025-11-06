import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useOAuth } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useWarmUpBrowser } from '@/hooks/useWarmUpBrowser';

export default function LoginScreen() {
  useWarmUpBrowser();

  const router = useRouter();
  const { startOAuthFlow: googleAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleAuth } = useOAuth({ strategy: 'oauth_apple' });

  const onSelectAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    const selectedAuth = strategy === 'oauth_google' ? googleAuth : appleAuth;

    try {
      const { createdSessionId, setActive } = await selectedAuth();

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      console.error('OAuth error', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.googleButton]}
            onPress={() => onSelectAuth('oauth_google')}
          >
            <Text style={styles.buttonText}>Continue with Google</Text>
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.button, styles.appleButton]}
              onPress={() => onSelectAuth('oauth_apple')}
            >
              <Text style={[styles.buttonText, styles.appleButtonText]}>Continue with Apple</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity style={[styles.button, styles.emailButton]}>
              <Text style={[styles.buttonText, styles.emailButtonText]}>Sign in with Email</Text>
            </TouchableOpacity>
          </Link>

          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <Link href="/(auth)/sign-up">
              <Text style={styles.link}>Sign up</Text>
            </Link>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButtonText: {
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#666',
    fontSize: 14,
  },
  emailButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  emailButtonText: {
    color: '#4285F4',
  },
  linkContainer: {
    flexDirection: 'row',
    marginTop: 20,
    justifyContent: 'center',
  },
  linkText: {
    color: '#666',
    fontSize: 14,
  },
  link: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600',
  },
});

