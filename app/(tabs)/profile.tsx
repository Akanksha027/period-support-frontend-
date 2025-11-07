import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth } from '@clerk/clerk-expo';
import { getSettings, updateSettings, UserSettings, setViewMode } from '../../lib/api';
import { setClerkTokenGetter } from '../../lib/api';

export default function Profile() {
  const { user, signOut, getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

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
    
    setSettings({
      averageCycleLength: 28,
      averagePeriodLength: 5,
      reminderEnabled: true,
      reminderDaysBefore: 3,
    });
    setLoading(false);
    
    try {
      const data = await getSettings();
      if (data) {
        setSettings(data);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('Error loading settings:', error);
      }
    }
  }, [user]);

  const handleSaveSettings = useCallback(async () => {
    if (!settings) return;

    setSaving(true);
    try {
      await updateSettings(settings);
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleSignOut = useCallback(async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
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
        <ActivityIndicator size="large" color={Colors.primary} />
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

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Average Cycle Length (days)</Text>
            <TextInput
              style={styles.settingInput}
              value={settings?.averageCycleLength?.toString() || '28'}
              onChangeText={(text) =>
                setSettings((prev) =>
                  prev ? { ...prev, averageCycleLength: parseInt(text) || 28 } : null
                )
              }
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Average Period Length (days)</Text>
            <TextInput
              style={styles.settingInput}
              value={settings?.averagePeriodLength?.toString() || '5'}
              onChangeText={(text) =>
                setSettings((prev) =>
                  prev ? { ...prev, averagePeriodLength: parseInt(text) || 5 } : null
                )
              }
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Reminder Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminders</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Reminders</Text>
            <Switch
              value={settings?.reminderEnabled ?? true}
              onValueChange={(value) =>
                setSettings((prev) =>
                  prev ? { ...prev, reminderEnabled: value } : null
                )
              }
              trackColor={{ false: Colors.border, true: Colors.secondary }}
              thumbColor={settings?.reminderEnabled ? Colors.primary : Colors.textSecondary}
            />
          </View>

          {settings?.reminderEnabled && (
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Remind me (days before)</Text>
              <TextInput
                style={styles.settingInput}
                value={settings?.reminderDaysBefore?.toString() || '3'}
                onChangeText={(text) =>
                  setSettings((prev) =>
                    prev ? { ...prev, reminderDaysBefore: parseInt(text) || 3 } : null
                  )
                }
                keyboardType="number-pad"
              />
            </View>
          )}
        </View>

        {/* Save Button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveSettings}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Text>
          </TouchableOpacity>
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  settingInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: Colors.text,
    width: 100,
    textAlign: 'right',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
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

