import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { getSettings, updateSettings, UserSettings, setViewMode } from '../../lib/api';
import { setClerkTokenGetter } from '../../lib/api';
import { clearStoredPushToken } from '../../lib/notifications';
import PeriLoader from '../../components/PeriLoader';

export default function Profile() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [cycleLength, setCycleLength] = useState<string>('');
  const [periodLength, setPeriodLength] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  useEffect(() => {
    if (user) {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await getSettings();
      if (data) {
        setSettings(data);
        setCycleLength(String(data.averageCycleLength || 28));
        setPeriodLength(String(data.averagePeriodLength || 5));
      } else {
        setSettings(null);
        setCycleLength('28');
        setPeriodLength('5');
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('Error loading settings:', error);
      }
      setSettings(null);
      setCycleLength('28');
      setPeriodLength('5');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleUpdateCycleLength = useCallback(async () => {
    const value = parseInt(cycleLength);
    if (isNaN(value) || value < 21 || value > 45) {
      Alert.alert('Invalid Input', 'Cycle length must be between 21 and 45 days.');
      setCycleLength(String(settings?.averageCycleLength || 28));
      return;
    }

    if (value === settings?.averageCycleLength) {
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await updateSettings({ averageCycleLength: value });
      if (updated) {
        setSettings(updated);
        // Emit event to refresh other pages
        DeviceEventEmitter.emit('settingsUpdated');
        Alert.alert('Success', 'Cycle length updated successfully!');
      }
    } catch (error: any) {
      console.error('Error updating cycle length:', error);
      Alert.alert('Error', error.message || 'Failed to update cycle length. Please try again.');
      setCycleLength(String(settings?.averageCycleLength || 28));
    } finally {
      setIsUpdating(false);
    }
  }, [cycleLength, settings]);

  const handleUpdatePeriodLength = useCallback(async () => {
    const value = parseInt(periodLength);
    if (isNaN(value) || value < 1 || value > 10) {
      Alert.alert('Invalid Input', 'Period length must be between 1 and 10 days.');
      setPeriodLength(String(settings?.averagePeriodLength || 5));
      return;
    }

    if (value === settings?.averagePeriodLength) {
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await updateSettings({ 
        averagePeriodLength: value,
        periodDuration: value, // Also update periodDuration for consistency
      });
      if (updated) {
        setSettings(updated);
        // Emit event to refresh other pages
        DeviceEventEmitter.emit('settingsUpdated');
        Alert.alert('Success', 'Period length updated successfully!');
      }
    } catch (error: any) {
      console.error('Error updating period length:', error);
      Alert.alert('Error', error.message || 'Failed to update period length. Please try again.');
      setPeriodLength(String(settings?.averagePeriodLength || 5));
    } finally {
      setIsUpdating(false);
    }
  }, [periodLength, settings]);

  const handleSignOut = useCallback(async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearStoredPushToken();
            await setViewMode(null);
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to sign out');
          }
        },
      },
    ]);
  }, [signOut, router]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <PeriLoader size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSubtitle}>{user?.emailAddresses[0]?.emailAddress}</Text>
      </View>

      <ScrollView>
        {/* Cycle Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cycle Settings</Text>
          <Text style={styles.sectionDescription}>
            Update your cycle and period lengths to improve predictions and calculations.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Average Cycle Length</Text>
              <Text style={styles.settingHint}>Range: 21-45 days</Text>
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.settingInput}
                value={cycleLength}
                onChangeText={(text) => {
                  // Only allow numbers
                  const numeric = text.replace(/[^0-9]/g, '');
                  setCycleLength(numeric);
                }}
                onBlur={handleUpdateCycleLength}
                keyboardType="number-pad"
                editable={!isUpdating && !loading}
                placeholder="28"
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.inputSuffix}>days</Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Average Period Length</Text>
              <Text style={styles.settingHint}>Range: 1-10 days</Text>
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.settingInput}
                value={periodLength}
                onChangeText={(text) => {
                  // Only allow numbers
                  const numeric = text.replace(/[^0-9]/g, '');
                  setPeriodLength(numeric);
                }}
                onBlur={handleUpdatePeriodLength}
                keyboardType="number-pad"
                editable={!isUpdating && !loading}
                placeholder="5"
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.inputSuffix}>days</Text>
            </View>
          </View>

          {isUpdating && (
            <View style={styles.updatingIndicator}>
              <PeriLoader size={20} />
              <Text style={styles.updatingText}>Updating...</Text>
            </View>
          )}
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingHint: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingInput: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    minWidth: 40,
    textAlign: 'right',
    padding: 0,
  },
  inputSuffix: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  updatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  updatingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  signOutButtonText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

