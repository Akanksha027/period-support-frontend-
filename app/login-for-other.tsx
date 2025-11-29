import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { loginForOtherAPI, setClerkTokenGetter, setViewMode, loadStoredViewModeRecord, peekStoredViewModeRecord } from '@/lib/api';
import PeriLoader from '../components/PeriLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginForOtherScreen() {
  const router = useRouter();
  const { isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'info',
    visible: false,
  });
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const viewerEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  const hideToast = useCallback(() => {
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    });
  }, [toastOpacity]);

  const showToast = useCallback(
    (message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3500) => {
      if (!message) return;
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
      setToast({ message, type, visible: true });
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      toastTimer.current = setTimeout(() => {
        hideToast();
      }, duration);
    },
    [hideToast, toastOpacity]
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  // Set up token getter for API calls
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Check if user is logged in
  useEffect(() => {
    if (!isSignedIn) {
      showToast("Please sign in before accessing someone else's account.", 'error');
      router.replace('/(auth)/sign-in');
    }
  }, [isSignedIn, router, showToast]);

  useEffect(() => {
    const redirectIfStored = async () => {
      if (!isSignedIn || !viewerEmail) return;
      const stored = await loadStoredViewModeRecord(viewerEmail);
      if (stored?.mode === 'OTHER') {
        router.replace('/(viewer-tabs)/insights');
      }
    };

    redirectIfStored();
  }, [isSignedIn, viewerEmail, router]);

  const handleVerifyCredentials = async () => {
    if (!email) {
      showToast('Enter an email address to continue.', 'error');
      return;
    }

    setLoading(true);
    try {
      if (viewerEmail) {
        const storedViewerMode = await peekStoredViewModeRecord(viewerEmail);
        if (storedViewerMode && storedViewerMode.mode !== 'OTHER') {
          showToast(
            'This account is linked to personal tracking. Please sign in with another email to manage someone else.',
            'error'
          );
          setLoading(false);
          return;
        }
        if (storedViewerMode?.mode === 'OTHER') {
          router.replace('/(viewer-tabs)/insights');
          setLoading(false);
          return;
        }
      }

      // Verify the email exists in the system
      const verifyResponse = await loginForOtherAPI.verifyCredentials(email);

      if (!verifyResponse.success) {
        showToast(verifyResponse.error || 'We could not find an account with that email.', 'error');
        return;
      }

      // Email exists, now send OTP
      await handleSendOTP(email);
    } catch (error: any) {
      console.error('Verify credentials error:', error);
      showToast(error?.response?.data?.error || 'We could not verify that email. Try again in a moment.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (emailAddress: string) => {
    try {
      const response = await loginForOtherAPI.sendOTP(emailAddress);

      if (response.success) {
        setOtpEmail(emailAddress);
        setStep('otp');
        showToast('We sent a verification code to the email address you provided.', 'success');
      } else {
        showToast(response.error || 'We could not send the verification code. Please try again.', 'error');
      }
    } catch (error: any) {
      console.error('Send OTP error:', error);
      showToast(
        error?.friendlyMessage || error?.response?.data?.error || 'We could not send the verification code. Please try again.',
        'error'
      );
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      showToast('Enter the 6-digit verification code from the email.', 'error');
      return;
    }

    if (!isSignedIn || !getToken) {
      showToast('Please sign in again to continue.', 'error');
      router.replace('/(auth)/sign-in');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        showToast('We could not confirm your session. Please sign in again.', 'error');
        router.replace('/(auth)/sign-in');
        setLoading(false);
        return;
      }

      const verifyResponse = await loginForOtherAPI.verifyOTP(otpEmail, otp);

      if (!verifyResponse.success) {
        showToast(
          verifyResponse.error || 'The verification code is incorrect. Please try again.',
          'error'
        );
        return;
      }

      if (!verifyResponse.tempToken) {
        showToast('We could not verify the code. Please request a new one.', 'error');
        return;
      }

      const viewerIdentifier = `device_${Date.now()}`;

      const completeResponse = await loginForOtherAPI.completeLogin(
        otpEmail,
        verifyResponse.tempToken,
        viewerIdentifier
      );

      if (completeResponse.success) {
        if (viewerEmail) {
          await setViewMode('OTHER', {
            email: viewerEmail,
            viewedUserId: completeResponse.viewer?.viewedUserId || completeResponse.selfUser?.id || null,
            viewedUserEmail: completeResponse.viewer?.viewedUserEmail || completeResponse.selfUser?.email || otpEmail,
            persist: true,
          });
        } else {
          await setViewMode('OTHER', {
            viewedUserId: completeResponse.viewer?.viewedUserId || completeResponse.selfUser?.id || null,
            viewedUserEmail: completeResponse.viewer?.viewedUserEmail || completeResponse.selfUser?.email || otpEmail,
          });
        }

        showToast('Access granted. Loading insights...', 'success');
        router.replace('/(viewer-tabs)/insights');
      } else {
        showToast(completeResponse.error || 'We could not complete the login. Please try again.', 'error');
      }
    } catch (error: any) {
      console.error('[Login For Other] Verify OTP error:', error);
      showToast(
        error?.friendlyMessage ||
          error?.response?.data?.error ||
          'We could not verify the code. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const cardContent =
    step === 'otp' ? (
      <>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={48} color="#FF6B9D" />
        </View>

        <Text style={styles.title}>Enter Verification Code</Text>
        <Text style={styles.subtitle}>We sent a 6-digit verification code to {otpEmail}</Text>
        <Text style={styles.note}>
          If you don't see the email within a minute, check your spam folder or go back to confirm the address.
        </Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="key-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={otp}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#999"
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (loading || otp.length !== 6) && styles.buttonDisabled]}
            onPress={handleVerifyOTP}
            disabled={loading || otp.length !== 6}
          >
            {loading ? <PeriLoader size={52} /> : <Text style={styles.buttonText}>Verify Code</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setStep('credentials');
              setOtp('');
            }}
          >
            <Text style={styles.linkText}>Back to email</Text>
          </TouchableOpacity>
        </View>
      </>
    ) : (
      <>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.iconContainer}>
          <Ionicons name="people" size={48} color="#FF6B9D" />
        </View>

        <Text style={styles.title}>Login for Someone Else</Text>
        <Text style={styles.subtitle}>
          Enter the email address of the person you support. We'll send them a one-time code to confirm access.
        </Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={email}
                placeholder="Enter their email address"
                placeholderTextColor="#999"
                onChangeText={(text) => setEmail(text)}
                keyboardType="email-address"
                editable={!loading}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (loading || !email) && styles.buttonDisabled]}
            onPress={handleVerifyCredentials}
            disabled={loading || !email}
          >
            {loading ? <PeriLoader size={48} /> : <Text style={styles.buttonText}>Continue</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
            <Text style={styles.linkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </>
    );

  const toastBackgroundColor =
    toast.type === 'success' ? '#36C88A' : toast.type === 'error' ? '#FF6B9D' : '#3A3A3A';

  return (
    <SafeAreaView style={styles.safeArea}>
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
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.card}>{cardContent}</View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {toast.visible ? (
        <Animated.View pointerEvents="none" style={[styles.toastWrapper, { opacity: toastOpacity }]}>
          <View style={[styles.toast, { backgroundColor: toastBackgroundColor }]}>
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  bottomWhite: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
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
    top: '20%',
    right: '15%',
  },
  star2: {
    top: '30%',
    right: '70%',
  },
  star3: {
    top: '10%',
    left: '20%',
  },
  scrollView: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    paddingVertical: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    width: 60,
    height: 60,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  logo: {
    width: '200%',
    height: '200%',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFE8F0',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  note: {
    fontSize: 12,
    color: '#999',
    marginBottom: 24,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  button: {
    backgroundColor: '#000',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 1,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: '#FF6B9D',
    fontSize: 14,
    fontWeight: '600',
  },
  keyboardAvoider: {
    flex: 1,
  },
  toastWrapper: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});