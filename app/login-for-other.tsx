import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { loginForOtherAPI, setClerkTokenGetter, setViewMode, loadStoredViewModeRecord, peekStoredViewModeRecord } from '@/lib/api';
import PeriLoader from '../components/PeriLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function LoginForOtherScreen() {
  const router = useRouter();
  const { isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);

  const viewerEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  // Set up token getter for API calls
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Check if user is logged in
  useEffect(() => {
    if (!isSignedIn) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to view someone else\'s account. Please log in first.',
        [
          {
            text: 'Go to Login',
            onPress: () => router.replace('/(auth)/sign-in'),
          },
        ]
      );
    }
  }, [isSignedIn]);

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
      Alert.alert('Error', 'Please enter email address');
      return;
    }

    setLoading(true);
    try {
      if (viewerEmail) {
        const storedViewerMode = await peekStoredViewModeRecord(viewerEmail);
        if (storedViewerMode && storedViewerMode.mode !== 'OTHER') {
          Alert.alert(
            'Access Restricted',
            "This account is configured for personal tracking. Please sign in with a different email to view someone else's data."
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
        Alert.alert('Error', verifyResponse.error || 'No account found with this email address');
        return;
      }

      // Email exists, now send OTP
      await handleSendOTP(email);
    } catch (error: any) {
      console.error('Verify credentials error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to verify email. Please try again.');
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
        Alert.alert('OTP Sent', 'Please check your email for the verification code. Check the backend console for the OTP code.');
      } else {
        Alert.alert('Error', response.error || 'Failed to send OTP');
      }
    } catch (error: any) {
      console.error('Send OTP error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to send OTP. Please try again.');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP code');
      return;
    }

    // Ensure user is logged in
    if (!isSignedIn || !getToken) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to complete this action. Please log in first.'
      );
      return;
    }

    setLoading(true);
    try {
      // Ensure token is available before making API calls
      const token = await getToken();
      if (!token) {
        Alert.alert('Error', 'Authentication token not available. Please log in again.');
        setLoading(false);
        return;
      }

      console.log('[Login For Other] User is logged in with Clerk ID:', userId);

      // Step 1: Verify OTP
      const verifyResponse = await loginForOtherAPI.verifyOTP(otpEmail, otp);

      if (!verifyResponse.success) {
        Alert.alert('Error', verifyResponse.error || 'Invalid OTP code');
        return;
      }

      // Step 2: Complete login - this creates the OTHER user record
      if (!verifyResponse.tempToken) {
        Alert.alert('Error', 'Verification token not received. Please try again.');
        return;
      }

      // Generate a viewer identifier (using device info or timestamp)
      const viewerIdentifier = `device_${Date.now()}`;

      console.log('[Login For Other] Completing login with token:', {
        hasToken: !!token,
        userId,
        viewedEmail: otpEmail,
      });

      const completeResponse = await loginForOtherAPI.completeLogin(
        otpEmail,
        verifyResponse.tempToken,
        viewerIdentifier
      );

      if (completeResponse.success) {
        // Store viewer info for later use
        console.log('[Login For Other] Login completed:', completeResponse.viewer);

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

        // OTP verified and OTHER user created successfully, navigate to viewer tabs
        router.replace('/(viewer-tabs)/insights');
      } else {
        Alert.alert('Error', completeResponse.error || 'Failed to complete login. Please try again.');
      }
    } catch (error: any) {
      console.error('[Login For Other] Verify OTP error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <View style={styles.mainContainer}>
        {/* Top pink gradient section with stars */}
        <LinearGradient
          colors={['#FFC1D6', '#FFB3C6', '#FFA6BA']}
          style={styles.topGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
        >
          {/* Decorative stars */}
          <View style={styles.starsContainer}>
            <Text style={[styles.star, styles.star1]}>✦</Text>
            <Text style={[styles.star, styles.star2]}>✦</Text>
            <Text style={[styles.star, styles.star3]}>✦</Text>
          </View>

          {/* Curved white overlay */}
          <View style={styles.curvedOverlay}>
            <View style={styles.curveShape} />
          </View>
        </LinearGradient>

        {/* Bottom white section */}
        <View style={styles.bottomWhite} />

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <View style={styles.card}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              {/* Icon */}
              <View style={styles.iconContainer}>
                <Ionicons name="shield-checkmark" size={48} color="#FF6B9D" />
              </View>

              <Text style={styles.title}>Enter Verification Code</Text>
              <Text style={styles.subtitle}>
                We've sent a 6-digit verification code to {otpEmail}
              </Text>
              <Text style={styles.note}>
                Note: Check your backend console for the OTP code (for development) 
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
                  {loading ? (
                    <PeriLoader size={32} />
                  ) : (
                    <Text style={styles.buttonText}>Verify Code</Text>
                  )}
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
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* Top pink gradient section with stars */}
      <LinearGradient
        colors={['#FFC1D6', '#FFB3C6', '#FFA6BA']}
        style={styles.topGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
      >
        {/* Decorative stars */}
        <View style={styles.starsContainer}>
          <Text style={[styles.star, styles.star1]}>✦</Text>
          <Text style={[styles.star, styles.star2]}>✦</Text>
          <Text style={[styles.star, styles.star3]}>✦</Text>
        </View>

        {/* Curved white overlay */}
        <View style={styles.curvedOverlay}>
          <View style={styles.curveShape} />
        </View>
      </LinearGradient>

      {/* Bottom white section */}
      <View style={styles.bottomWhite} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.card}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="people" size={48} color="#FF6B9D" />
            </View>

            <Text style={styles.title}>Login for Someone Else</Text>
            <Text style={styles.subtitle}>
              Enter the email address of the person you want to track periods for. An OTP will be sent to their email for verification.
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
                {loading ? (
                  <PeriLoader size={32} />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => router.back()}
              >
                <Text style={styles.linkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
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
    opacity: 0.6,
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
});