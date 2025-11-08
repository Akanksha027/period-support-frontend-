import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { useOAuth } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useWarmUpBrowser } from '@/hooks/useWarmUpBrowser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

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
    <LinearGradient
      colors={['#FFE5ED', '#FFC1D6', '#FFE5ED']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Decorative stars */}
      <View style={styles.starsContainer}>
        <Text style={[styles.star, styles.star1]}>✨</Text>
        <Text style={[styles.star, styles.star2]}>✨</Text>
        <Text style={[styles.star, styles.star3]}>✨</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Log in to access your account</Text>

          {/* Buttons Container */}
          <View style={styles.buttonContainer}>
            {/* Email Button - Direct to sign-in page */}
            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity style={styles.emailButton}>
                <Text style={styles.emailButtonText}>Sign in with Email</Text>
              </TouchableOpacity>
            </Link>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or login with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons Row */}
            <View style={styles.socialButtonsRow}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => onSelectAuth('oauth_google')}
              >
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => onSelectAuth('oauth_apple')}
                >
                  <Ionicons name="logo-apple" size={20} color="#000" />
                  <Text style={styles.socialButtonText}>Apple</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Sign up link */}
            <View style={styles.linkContainer}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <Link href="/(auth)/sign-up">
                <Text style={styles.link}>Sign up</Text>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  starsContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  star: {
    position: 'absolute',
    fontSize: 20,
    opacity: 0.6,
  },
  star1: {
    top: '15%',
    left: '20%',
  },
  star2: {
    top: '25%',
    right: '15%',
  },
  star3: {
    top: '10%',
    right: '30%',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  logoContainer: {
    width: 80,
    height: 80,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  emailButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#999',
    fontSize: 13,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  socialButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'center',
  },
  linkText: {
    color: '#666',
    fontSize: 14,
  },
  link: {
    color: '#FF6B9D',
    fontSize: 14,
    fontWeight: '600',
  },
});