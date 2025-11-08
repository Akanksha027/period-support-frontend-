import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { api } from '@/lib/api';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PeriLoader from '../components/PeriLoader';

type Step = 'birthDate' | 'lastPeriod' | 'periodDuration' | 'cycleLength' | 'complete';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('birthDate');

  // Form data
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | null>(null);
  const [showLastPeriodPicker, setShowLastPeriodPicker] = useState(false);
  const [rememberLastPeriod, setRememberLastPeriod] = useState<boolean | null>(null);
  const [periodDuration, setPeriodDuration] = useState<string>('');
  const [rememberPeriodDuration, setRememberPeriodDuration] = useState<boolean | null>(null);
  const [averageCycleLength, setAverageCycleLength] = useState<string>('');
  const [rememberCycleLength, setRememberCycleLength] = useState<boolean | null>(null);

  const handleNext = () => {
    switch (step) {
      case 'birthDate':
        if (!birthDate) {
          Alert.alert('Required', 'Please select your birth date');
          return;
        }
        setStep('lastPeriod');
        break;
      case 'lastPeriod':
        setStep('periodDuration');
        break;
      case 'periodDuration':
        setStep('cycleLength');
        break;
      case 'cycleLength':
        handleComplete();
        break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'lastPeriod':
        setStep('birthDate');
        break;
      case 'periodDuration':
        setStep('lastPeriod');
        break;
      case 'cycleLength':
        setStep('periodDuration');
        break;
    }
  };

  const handleComplete = async () => {
    if (!user) {
      Alert.alert('Error', 'User not found');
      return;
    }

    setLoading(true);
    try {
      // Prepare data
      const birthYear = birthDate ? birthDate.getFullYear() : null;
      const lastPeriod = rememberLastPeriod === false ? null : lastPeriodDate;
      const periodDur = rememberPeriodDuration === false ? 5 : (periodDuration ? parseInt(periodDuration) : 5);
      const cycleLen = rememberCycleLength === false ? 28 : (averageCycleLength ? parseInt(averageCycleLength) : 28);

      // Get token first
      const token = await getToken();
      if (!token) {
        Alert.alert('Error', 'Authentication failed. Please try again.');
        return;
      }

      const email = user.emailAddresses[0]?.emailAddress;
      const clerkId = user.id;

      // Validate required data
      if (!email || !clerkId) {
        Alert.alert('Error', 'Missing user information. Please try logging in again.');
        return;
      }

      // Log for debugging
      console.log('[Onboarding] Sending request with:', {
        email,
        clerkId,
        hasToken: !!token,
        tokenLength: token.length,
        tokenPreview: token.substring(0, 30) + '...',
        birthYear,
        lastPeriodDate: lastPeriod ? lastPeriod.toISOString() : null,
        periodDuration: periodDur,
        averageCycleLength: cycleLen,
      });

      // Save settings to backend
      const requestBody = {
        birthYear,
        lastPeriodDate: lastPeriod ? lastPeriod.toISOString() : null,
        periodDuration: periodDur,
        averageCycleLength: cycleLen,
        email,
        clerkId,
      };

      console.log('[Onboarding] Request Body:', JSON.stringify(requestBody, null, 2));

      const response = await api.patch(
        '/api/user/settings',
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            clerkId,
            email,
          },
        }
      );

      if (response.data.success) {
        router.replace('/(tabs)/home');
      } else {
        Alert.alert('Error', 'Failed to save settings. Please try again.');
      }
    } catch (error: any) {
      console.error('Onboarding error:', error);
      console.error('Error details:', {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: error?.message,
      });
      
      const errorMessage = error?.response?.data?.error || 
                          error?.response?.data?.details ||
                          error?.message || 
                          'Failed to complete onboarding. Please try again.';
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderBirthDate = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="calendar" size={48} color="#FF6B9D" />
      </View>
      <Text style={styles.title}>When were you born?</Text>
      <Text style={styles.subtitle}>We'll use this to personalize your experience</Text>

      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowBirthDatePicker(true)}
      >
        <Ionicons name="calendar-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
        <Text style={[styles.dateButtonText, !birthDate && styles.placeholderText]}>
          {birthDate ? birthDate.toLocaleDateString() : 'Select birth date'}
        </Text>
      </TouchableOpacity>

      {showBirthDatePicker && (
        <DateTimePicker
          value={birthDate || new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowBirthDatePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setBirthDate(selectedDate);
            }
          }}
          maximumDate={new Date()}
        />
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, !birthDate && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!birthDate}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLastPeriod = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="water" size={48} color="#FF6B9D" />
      </View>
      <Text style={styles.title}>When was your last period?</Text>
      <Text style={styles.subtitle}>This helps us track your cycle accurately</Text>

      <TouchableOpacity
        style={[styles.dateButton, rememberLastPeriod === false && styles.dateButtonDisabled]}
        onPress={() => setShowLastPeriodPicker(true)}
        disabled={rememberLastPeriod === false}
      >
        <Ionicons name="calendar-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
        <Text style={[styles.dateButtonText, !lastPeriodDate && styles.placeholderText]}>
          {lastPeriodDate ? lastPeriodDate.toLocaleDateString() : 'Select date'}
        </Text>
      </TouchableOpacity>

      {showLastPeriodPicker && (
        <DateTimePicker
          value={lastPeriodDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowLastPeriodPicker(Platform.OS === 'ios');
            if (selectedDate) {
              setLastPeriodDate(selectedDate);
              setRememberLastPeriod(true);
            }
          }}
          maximumDate={new Date()}
        />
      )}

      <TouchableOpacity
        style={[styles.skipButton, rememberLastPeriod === false && styles.skipButtonActive]}
        onPress={() => {
          setRememberLastPeriod(false);
          setLastPeriodDate(null);
        }}
      >
        <Text style={styles.skipButtonText}>I don't remember</Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleBack}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleNext}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPeriodDuration = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="time" size={48} color="#FF6B9D" />
      </View>
      <Text style={styles.title}>How long do your periods usually last?</Text>
      <Text style={styles.subtitle}>Average is 5 days</Text>

      <View style={styles.inputWrapper}>
        <Ionicons name="timer-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
        <TextInput
          style={[styles.input, rememberPeriodDuration === false && styles.inputDisabled]}
          placeholder="Enter number of days (e.g., 5)"
          placeholderTextColor="#999"
          value={periodDuration}
          onChangeText={(text) => {
            setPeriodDuration(text.replace(/[^0-9]/g, ''));
            setRememberPeriodDuration(true);
          }}
          keyboardType="number-pad"
          editable={rememberPeriodDuration !== false}
        />
      </View>

      <TouchableOpacity
        style={[styles.skipButton, rememberPeriodDuration === false && styles.skipButtonActive]}
        onPress={() => {
          setRememberPeriodDuration(false);
          setPeriodDuration('');
        }}
      >
        <Text style={styles.skipButtonText}>I don't remember (default: 5 days)</Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleBack}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleNext}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCycleLength = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="repeat" size={48} color="#FF6B9D" />
      </View>
      <Text style={styles.title}>What's your average cycle length?</Text>
      <Text style={styles.subtitle}>Average is 28 days</Text>

      <View style={styles.inputWrapper}>
        <Ionicons name="stats-chart-outline" size={20} color="#FF6B9D" style={styles.inputIcon} />
        <TextInput
          style={[styles.input, rememberCycleLength === false && styles.inputDisabled]}
          placeholder="Enter number of days (e.g., 28)"
          placeholderTextColor="#999"
          value={averageCycleLength}
          onChangeText={(text) => {
            setAverageCycleLength(text.replace(/[^0-9]/g, ''));
            setRememberCycleLength(true);
          }}
          keyboardType="number-pad"
          editable={rememberCycleLength !== false}
        />
      </View>

      <TouchableOpacity
        style={[styles.skipButton, rememberCycleLength === false && styles.skipButtonActive]}
        onPress={() => {
          setRememberCycleLength(false);
          setAverageCycleLength('');
        }}
      >
        <Text style={styles.skipButtonText}>I don't remember (default: 28 days)</Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleBack}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={loading}
        >
          {loading ? (
            <PeriLoader size={32} />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <View style={styles.progressContainer}>
            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${((['birthDate', 'lastPeriod', 'periodDuration', 'cycleLength'].indexOf(step) + 1) / 4) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              Step {['birthDate', 'lastPeriod', 'periodDuration', 'cycleLength'].indexOf(step) + 1} of 4
            </Text>
          </View>

          <View style={styles.cardShadow}>
            <View style={styles.card}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              {step === 'birthDate' && renderBirthDate()}
              {step === 'lastPeriod' && renderLastPeriod()}
              {step === 'periodDuration' && renderPeriodDuration()}
              {step === 'cycleLength' && renderCycleLength()}
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
    paddingHorizontal: 24,
    paddingTop: 140,
    paddingBottom: 48,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFE8F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'center',
  },
  logo: {
    width: '68%',
    height: '68%',
  },
  progressContainer: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 8,
  },
  progressBackground: {
    height: 6,
    backgroundColor: '#FFE8F0',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF6B9D',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#FF6B9D',
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 34,
  },
  stepContainer: {
    flex: 1,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFE8F0',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    color: '#121212',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6F6F6F',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  dateButton: {
    height: 48,
    borderWidth: 1,
    borderColor: '#F0D9E6',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    justifyContent: 'center',
    backgroundColor: '#FAF4F8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateButtonDisabled: {
    backgroundColor: '#F0F0F0',
    opacity: 0.6,
  },
  dateButtonText: {
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: '#F0D9E6',
    borderRadius: 14,
    backgroundColor: '#FAF4F8',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  inputDisabled: {
    backgroundColor: '#F0F0F0',
    color: '#999',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderRadius: 8,
  },
  skipButtonActive: {
    backgroundColor: '#FFE8F0',
  },
  skipButtonText: {
    color: '#FF6B9D',
    fontSize: 13,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#111111',
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E3E3',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#121212',
  },
  cardShadow: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 32,
    shadowColor: 'rgba(17,17,17,0.16)',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 20,
    backgroundColor: 'transparent',
  },
});