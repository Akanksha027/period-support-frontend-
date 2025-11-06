import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { createSymptom, createMood, getSymptoms, getMoods, Symptom, Mood } from '../lib/api';

const MOOD_OPTIONS = [
  { emoji: '😊', label: 'Calm' },
  { emoji: '😄', label: 'Happy' },
  { emoji: '⚡', label: 'Energetic' },
  { emoji: '😋', label: 'Frisky' },
  { emoji: '😢', label: 'Mood swings' },
  { emoji: '😠', label: 'Irritated' },
  { emoji: '😞', label: 'Sad' },
  { emoji: '😥', label: 'Anxious' },
  { emoji: '😔', label: 'Depressed' },
  { emoji: '😟', label: 'Feeling guilty' },
  { emoji: '☁️', label: 'Obsessive thoughts' },
  { emoji: '🔋', label: 'Low energy' },
  { emoji: '😐', label: 'Apathetic' },
  { emoji: '😕', label: 'Confused' },
  { emoji: '💥', label: 'Very self-critical' },
];

const SYMPTOM_OPTIONS = [
  { emoji: '👍', label: 'Everything is fine' },
  { emoji: '🔴', label: 'Cramps' },
  { emoji: '🍈', label: 'Tender breasts' },
  { emoji: '🤕', label: 'Headache' },
  { emoji: '🟠', label: 'Acne' },
  { emoji: '⭕', label: 'Backache' },
  { emoji: '🟥', label: 'Fatigue' },
  { emoji: '🍔', label: 'Cravings' },
  { emoji: '➕', label: 'Insomnia' },
  { emoji: '🔴', label: 'Abdominal pain' },
  { emoji: '⬇️', label: 'Vaginal itching' },
];

export default function LogSymptomsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (params.date) {
      return new Date(params.date);
    }
    return new Date();
  });
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingMoods, setExistingMoods] = useState<Mood[]>([]);
  const [existingSymptoms, setExistingSymptoms] = useState<Symptom[]>([]);

  // Load existing moods and symptoms for the selected date
  useEffect(() => {
    loadExistingData();
  }, [selectedDate]);

  const loadExistingData = async () => {
    try {
      setLoading(true);
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const [moods, symptoms] = await Promise.all([
        getMoods(startDate.toISOString(), endDate.toISOString()),
        getSymptoms(startDate.toISOString(), endDate.toISOString()),
      ]);

      setExistingMoods(moods);
      setExistingSymptoms(symptoms);
      setSelectedMoods(moods.map(m => m.type));
      setSelectedSymptoms(symptoms.map(s => s.type));
    } catch (error) {
      console.error('[LogSymptoms] Error loading existing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
  }, [selectedDate]);

  const toggleMood = useCallback((mood: string) => {
    setSelectedMoods(prev => {
      if (prev.includes(mood)) {
        return prev.filter(m => m !== mood);
      }
      return [...prev, mood];
    });
  }, []);

  const toggleSymptom = useCallback((symptom: string) => {
    setSelectedSymptoms(prev => {
      if (prev.includes(symptom)) {
        return prev.filter(s => s !== symptom);
      }
      return [...prev, symptom];
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (selectedMoods.length === 0 && selectedSymptoms.length === 0) {
      Alert.alert('Nothing to save', 'Please select at least one mood or symptom.');
      return;
    }

    setSaving(true);
    try {
      const dateStr = new Date(selectedDate);
      dateStr.setHours(0, 0, 0, 0);
      const dateISO = dateStr.toISOString();

      // Get current selections
      const currentMoods = existingMoods.map(m => m.type);
      const currentSymptoms = existingSymptoms.map(s => s.type);

      // Find moods to add (new selections not in existing)
      const moodsToAdd = selectedMoods.filter(m => !currentMoods.includes(m));
      // Find moods to remove (existing not in new selections)
      const moodsToRemove = existingMoods.filter(m => !selectedMoods.includes(m.type));

      // Find symptoms to add (new selections not in existing)
      const symptomsToAdd = selectedSymptoms.filter(s => !currentSymptoms.includes(s));
      // Find symptoms to remove (existing not in new selections)
      const symptomsToRemove = existingSymptoms.filter(s => !selectedSymptoms.includes(s.type));

      // Save new moods and symptoms in parallel
      const savePromises: Promise<any>[] = [];

      moodsToAdd.forEach(mood => {
        savePromises.push(createMood({ date: dateISO, type: mood }));
      });

      symptomsToAdd.forEach(symptom => {
        savePromises.push(createSymptom({ date: dateISO, type: symptom, severity: 3 }));
      });

      // Note: We'll need to add delete functions for moods/symptoms if needed
      // For now, we only add new ones

      await Promise.all(savePromises);

      // Optimistically update - navigate back immediately
      router.back();
      
      // Small delay to allow navigation, then show success
      setTimeout(() => {
        Alert.alert('Success', 'Your symptoms and moods have been saved!');
      }, 300);
    } catch (error: any) {
      console.error('[LogSymptoms] Error saving:', error);
      Alert.alert('Error', error.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [selectedDate, selectedMoods, selectedSymptoms, existingMoods, existingSymptoms, router]);

  const filteredMoods = MOOD_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(searchText.toLowerCase())
  );

  const filteredSymptoms = SYMPTOM_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(searchText.toLowerCase())
  );

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const dateDisplay = isToday
    ? 'Today'
    : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.dateContainer}>
          <TouchableOpacity onPress={() => handleDateChange('prev')} style={styles.dateNavButton}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.dateText}>{dateDisplay}</Text>
          <TouchableOpacity onPress={() => handleDateChange('next')} style={styles.dateNavButton}>
            <Ionicons name="chevron-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={Colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Mood Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mood</Text>
              <View style={styles.optionsGrid}>
                {filteredMoods.map((option, index) => {
                  const isSelected = selectedMoods.includes(option.label);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                      onPress={() => toggleMood(option.label)}
                    >
                      <Text style={styles.optionEmoji}>{option.emoji}</Text>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Symptoms Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Symptoms</Text>
              <View style={styles.optionsGrid}>
                {filteredSymptoms.map((option, index) => {
                  const isSelected = selectedSymptoms.includes(option.label);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                      onPress={() => toggleSymptom(option.label)}
                    >
                      <Text style={styles.optionEmoji}>{option.emoji}</Text>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    padding: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateNavButton: {
    padding: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    minWidth: 60,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionChipSelected: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

