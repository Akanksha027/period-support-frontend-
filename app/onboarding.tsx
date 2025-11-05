import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { api } from '@/lib/api';
import DateTimePicker from '@react-native-community/datetimepicker';

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

      // Save settings to backend
      const response = await api.patch(
        '/api/user/settings',
        {
          birthYear,
          lastPeriodDate: lastPeriod ? lastPeriod.toISOString() : null,
          periodDuration: periodDur,
          averageCycleLength: cycleLen,
          email: user.emailAddresses[0]?.emailAddress,
          clerkId: user.id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        // Navigate to home
        router.replace('/home');
      } else {
        Alert.alert('Error', 'Failed to save settings. Please try again.');
      }
    } catch (error: any) {
      console.error('Onboarding error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderBirthDate = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>When were you born?</Text>
      <Text style={styles.subtitle}>We'll use this to personalize your experience</Text>

      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowBirthDatePicker(true)}
      >
        <Text style={styles.dateButtonText}>
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
        style={[styles.button, styles.buttonPrimary]}
        onPress={handleNext}
        disabled={!birthDate}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLastPeriod = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>When was your last period?</Text>
      <Text style={styles.subtitle}>This helps us track your cycle accurately</Text>

      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowLastPeriodPicker(true)}
        disabled={rememberLastPeriod === false}
      >
        <Text style={styles.dateButtonText}>
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
      <Text style={styles.title}>How long do your periods usually last?</Text>
      <Text style={styles.subtitle}>Average is 5 days</Text>

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
      <Text style={styles.title}>What's your average cycle length?</Text>
      <Text style={styles.subtitle}>Average is 28 days</Text>

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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${((['birthDate', 'lastPeriod', 'periodDuration', 'cycleLength'].indexOf(step) + 1) / 4) * 100}%` }]} />
        </View>

        {step === 'birthDate' && renderBirthDate()}
        {step === 'lastPeriod' && renderLastPeriod()}
        {step === 'periodDuration' && renderPeriodDuration()}
        {step === 'cycleLength' && renderCycleLength()}
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
  progressContainer: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginBottom: 32,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  stepContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  dateButton: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#000',
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
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    color: '#999',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  skipButtonActive: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  skipButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto',
    paddingTop: 32,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
  },
  buttonSecondary: {
    backgroundColor: '#f0f0f0',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#000',
  },
});

