import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { loginForOtherAPI, setClerkTokenGetter, setViewMode, loadStoredViewModeRecord, peekStoredViewModeRecord } from '@/lib/api';
import PeriLoader from '../components/PeriLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

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
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    variant?: 'info' | 'success' | 'error';
    primaryLabel?: string;
    onPrimary?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    variant: 'info',
  });

  const viewerEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const hideDialog = () => setDialog((prev) => ({ ...prev, visible: false }));
  const showDialog = ({
    title,
    message,
    variant = 'info',
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary,
  }: {
    title: string;
    message: string;
    variant?: 'info' | 'success' | 'error';
    primaryLabel?: string;
    onPrimary?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  }) =>
    setDialog({
      visible: true,
      title,
      message,
      variant,
      primaryLabel,
      onPrimary,
      secondaryLabel,
      onSecondary,
    });

  const renderDialog = () => {
    if (!dialog.visible) return null;

    const accentColor =
      dialog.variant === 'success'
        ? '#36C88A'
        : dialog.variant === 'error'
        ? '#FF6B9D'
        : Colors.primary;

    return (
      <Modal transparent animationType="fade" visible={dialog.visible} onRequestClose={hideDialog}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard}>
            <View style={[styles.dialogIconWrapper, { backgroundColor: `${accentColor}1A` }]}>
              <Ionicons
                name={
                  dialog.variant === 'success'
                    ? 'checkmark-circle'
                    : dialog.variant === 'error'
                    ? 'alert-circle'
                    : 'information-circle'
                }
                size={32}
                color={accentColor}
              />
            </View>
            <Text style={styles.dialogTitle}>{dialog.title}</Text>
            <Text style={styles.dialogMessage}>{dialog.message}</Text>
            <View style={styles.dialogActions}>
              {dialog.secondaryLabel ? (
                <TouchableOpacity
                  style={[styles.dialogButton, styles.dialogSecondaryButton]}
                  onPress={() => {
                    hideDialog();
                    dialog.onSecondary?.();
                  }}
                >
                  <Text style={[styles.dialogButtonText, styles.dialogSecondaryButtonText]}>
                    {dialog.secondaryLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.dialogButton, { backgroundColor: accentColor }]}
                onPress={() => {
                  hideDialog();
                  dialog.onPrimary?.();
                }}
              >
                <Text style={[styles.dialogButtonText, styles.dialogPrimaryButtonText]}>
                  {dialog.primaryLabel || 'OK'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Set up token getter for API calls
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Check if user is logged in
  useEffect(() => {
    if (!isSignedIn) {
      showDialog({
        title: 'Authentication Required',
        message: "You must be logged in to view someone else's account. Please log in first.",
        variant: 'info',
        primaryLabel: 'Go to login',
        onPrimary: () => router.replace('/(auth)/sign-in'),
      });
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
      showDialog({
        title: 'Missing Email',
        message: 'Please enter an email address before continuing.',
        variant: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      if (viewerEmail) {
        const storedViewerMode = await peekStoredViewModeRecord(viewerEmail);
        if (storedViewerMode && storedViewerMode.mode !== 'OTHER') {
          showDialog({
            title: 'Access Restricted',
            message:
              "This account is configured for personal tracking. Please sign in with a different email to view someone else's data.",
            variant: 'error',
          });
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
        showDialog({
          title: 'Verification Failed',
          message: verifyResponse.error || 'No account found with this email address.',
          variant: 'error',
        });
        return;
      }

      // Email exists, now send OTP
      await handleSendOTP(email);
    } catch (error: any) {
      console.error('Verify credentials error:', error);
      showDialog({
        title: 'Verification Failed',
        message: error?.response?.data?.error || 'Failed to verify email. Please try again.',
        variant: 'error',
      });
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
        showDialog({
          title: 'OTP Sent',
          message:
            'Please check your email for the verification code. (For development: check the backend console too.)',
          variant: 'success',
        });
      } else {
        showDialog({
          title: 'OTP Failed',
          message: response.error || 'Failed to send OTP.',
          variant: 'error',
        });
      }
    } catch (error: any) {
      console.error('Send OTP error:', error);
      showDialog({
        title: 'OTP Failed',
        message: error?.friendlyMessage || error?.response?.data?.error || 'Failed to send OTP. Please try again.',
        variant: 'error',
      });
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      showDialog({
        title: 'Invalid OTP',
        message: 'Please enter the 6-digit verification code sent to the email.',
        variant: 'error',
      });
      return;
    }

    if (!isSignedIn || !getToken) {
      showDialog({
        title: 'Authentication Required',
        message: 'You must be logged in to complete this action. Please log in first.',
        variant: 'error',
        primaryLabel: 'Go to login',
        onPrimary: () => router.replace('/(auth)/sign-in'),
      });
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        showDialog({
          title: 'Authentication Error',
          message: 'Authentication token not available. Please log in again.',
          variant: 'error',
        });
        setLoading(false);
        return;
      }

      console.log('[Login For Other] User is logged in with Clerk ID:', userId);

      const verifyResponse = await loginForOtherAPI.verifyOTP(otpEmail, otp);

      if (!verifyResponse.success) {
        showDialog({
          title: 'Invalid OTP',
          message:
            verifyResponse.error ||
            'The verification code entered is incorrect. Please try again.',
          variant: 'error',
        });
        return;
      }

      if (!verifyResponse.tempToken) {
        showDialog({
          title: 'Verification Error',
          message: 'Verification token not received. Please try again.',
          variant: 'error',
        });
        return;
      }

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

        router.replace('/(viewer-tabs)/insights');
      } else {
        showDialog({
          title: 'Login Failed',
          message: completeResponse.error || 'Failed to complete login. Please try again.',
          variant: 'error',
        });
      }
    } catch (error: any) {
      console.error('[Login For Other] Verify OTP error:', error);
        showDialog({
          title: 'Verification Failed',
          message:
            error?.friendlyMessage ||
            error?.response?.data?.error ||
            'Failed to verify OTP. Please try again.',
          variant: 'error',
        });
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <View style={styles.mainContainer}>
        {renderDialog()}
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
      {renderDialog()}
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
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  dialogIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  dialogActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 12,
  },
  dialogButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dialogPrimaryButtonText: {
    color: '#FFFFFF',
  },
  dialogSecondaryButton: {
    backgroundColor: '#F6F6F8',
  },
  dialogSecondaryButtonText: {
    color: Colors.text,
  },
});