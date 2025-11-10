import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { getSettings, UserSettings, setViewMode } from '../../lib/api';
import { setClerkTokenGetter } from '../../lib/api';
import { clearStoredPushToken } from '../../lib/notifications';
import PeriLoader from '../../components/PeriLoader';

export default function Profile() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
            Cycle metrics are currently read-only. Reach out to support if something looks off.
          </Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Average Cycle Length</Text>
            <View style={styles.settingValue}>
              <Text style={styles.settingValueText}>
                {settings?.averageCycleLength ?? 28} days
              </Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Average Period Length</Text>
            <View style={styles.settingValue}>
              <Text style={styles.settingValueText}>
                {settings?.averagePeriodLength ?? 5} days
              </Text>
            </View>
          </View>
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
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  settingValue: {
    minWidth: 90,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-end',
  },
  settingValueText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
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

