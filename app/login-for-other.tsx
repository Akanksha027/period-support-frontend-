import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { loginForOtherAPI } from '@/lib/api';

export default function LoginForOtherScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);

  const handleVerifyCredentials = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter email address');
      return;
    }

    setLoading(true);
    try {
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

    setLoading(true);
    try {
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

      const completeResponse = await loginForOtherAPI.completeLogin(
        otpEmail,
        verifyResponse.tempToken,
        viewerIdentifier
      );

      if (completeResponse.success) {
        // Store viewer info for later use
        console.log('Login completed:', completeResponse.viewer);
        
        // OTP verified and OTHER user created successfully, navigate to tabs home
        // The app will automatically detect userType=OTHER and show view-only mode
        router.replace('/(tabs)/home');
      } else {
        Alert.alert('Error', completeResponse.error || 'Failed to complete login. Please try again.');
      }
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Enter Verification Code</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to {otpEmail}
          </Text>
          <Text style={styles.note}>
            Note: Check your backend console for the OTP code (for development) 
          </Text>

          <View style={styles.form}>
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

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
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
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Login for Someone Else</Text>
        <Text style={styles.subtitle}>
          Enter the email address of the person you want to track periods for. An OTP will be sent to their email for verification.
        </Text>

        <View style={styles.form}>
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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyCredentials}
            disabled={loading || !email}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
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
    marginBottom: 32,
  },
  note: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  form: {
    width: '100%',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#007AFF',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

