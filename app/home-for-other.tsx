import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SignOutButton } from '@/components/SignOutButton';

export default function HomeForOtherScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Home - Someone Else</Text>
        <Text style={styles.description}>
          You are logged in to track periods for someone else.
        </Text>
        <Text style={styles.description}>
          This is the home screen for managing someone else's period tracking.
        </Text>

        <View style={styles.signOutContainer}>
          <SignOutButton />
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
    marginBottom: 16,
    color: '#000',
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  signOutContainer: {
    marginTop: 32,
  },
});

