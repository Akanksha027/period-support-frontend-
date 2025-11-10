import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Link } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PeriLoader from '../../components/PeriLoader';

const AuthScreenWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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

    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoider}
      keyboardVerticalOffset={Platform.select({ ios: 0, android: 20 })}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.card}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
);

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const redirectUrl = AuthSession.makeRedirectUri({
    path: 'auth/callback',
  });

  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({ strategy: 'oauth_apple' });

  const handleGoogleSignIn = async () => {
    try {
      if (!startGoogleOAuth) {
        Alert.alert('Error', 'Google sign-in is unavailable right now. Please try again later.');
        return;
      }
      setLoading(true);
      const { createdSessionId, setActive: setOAuthActive } = await startGoogleOAuth({
        redirectUrl,
      });

      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        router.replace('/choose-login-type');
      }
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      Alert.alert('Error', err?.errors?.[0]?.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      if (!startAppleOAuth) {
        Alert.alert('Error', 'Apple sign-in is unavailable right now. Please try again later.');
        return;
      }
      setLoading(true);
      const { createdSessionId, setActive: setOAuthActive } = await startAppleOAuth({
        redirectUrl,
      });

      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        router.replace('/choose-login-type');
      }
    } catch (err: any) {
      console.error('Apple OAuth error:', err);
      Alert.alert('Error', err?.errors?.[0]?.message || 'Failed to sign in with Apple. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;

    try {
      setLoading(true);
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/choose-login-type');
      } else {
        console.error('Sign in incomplete:', JSON.stringify(signInAttempt, null, 2));
        Alert.alert('Error', 'Sign in incomplete. Please try again.');
      }
    } catch (err: any) {
      console.error('Sign in error:', JSON.stringify(err, null, 2));
      Alert.alert('Error', err?.errors?.[0]?.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenWrapper>
      <View style={styles.logoContainer}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      </View>

      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Log in to access your account</Text>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            value={emailAddress}
            placeholder="example@gmail.com"
            placeholderTextColor="#999"
            onChangeText={(email) => setEmailAddress(email)}
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              placeholder="••••••••"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              onChangeText={(password) => setPassword(password)}
            />
            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.signInButton, loading && styles.buttonDisabled]}
          onPress={onSignInPress}
          disabled={loading}
        >
          {loading ? <PeriLoader size={32} /> : <Text style={styles.signInButtonText}>Sign in</Text>}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or login with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialButtonsRow}>
          <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn} disabled={loading}>
            <Ionicons name="logo-google" size={20} color="#DB4437" />
            <Text style={styles.socialButtonText}>Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn} disabled={loading}>
            <Ionicons name="logo-apple" size={20} color="#000" />
            <Text style={styles.socialButtonText}>Apple</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.linkContainer}>
          <Text style={styles.linkText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={styles.link}>Sign up</Text>
          </Link>
        </View>
      </View>
    </AuthScreenWrapper>
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
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    zIndex: 10,
  },
  keyboardAvoider: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    paddingVertical: 24,
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
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    backgroundColor: '#F9F9F9',
    color: '#000',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  eyeIcon: {
    padding: 4,
  },
  signInButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
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
    marginTop: 8,
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
    marginTop: 16,
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