import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { CyclePredictions } from '../lib/periodCalculations';
import { PHASE_PALETTE, PhaseKey } from '../constants/phasePalette';
import { Colors } from '../constants/Colors';

interface PhaseGuideProps {
  predictions: CyclePredictions;
  currentPhase?: PhaseKey;
  style?: StyleProp<ViewStyle>;
}

const phaseOrder: PhaseKey[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];

function formatDate(date: Date | null | undefined) {
  if (!date) return null;
  const normalised = new Date(date);
  return normalised.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildMetaText(phase: PhaseKey, predictions: CyclePredictions): string {
  switch (phase) {
    case 'menstrual': {
      const next = formatDate(predictions.nextPeriodDate);
      return next ? `Next flow is expected around ${next}.` : 'Track your flow days to keep predictions sharp.';
    }
    case 'follicular': {
      const start = predictions.periodLength ? formatDate(predictions.nextPeriodDate) : null;
      const ovulation = formatDate(predictions.ovulationDate);
      if (ovulation) {
        return `Energy builds until ovulation near ${ovulation}.`;
      }
      return 'Body rebuilds lining and prepares an egg after menstruation.';
    }
    case 'ovulation': {
      const ovulation = formatDate(predictions.ovulationDate);
      return ovulation ? `Peak fertility about ${ovulation}.` : 'Fertility peaks once per cycle.';
    }
    case 'luteal': {
      const next = formatDate(predictions.nextPeriodDate);
      return next ? `Winds down into the next period around ${next}.` : 'Listen for PMS cues and rest where needed.';
    }
    default:
      return '';
  }
}

export const PhaseGuide: React.FC<PhaseGuideProps> = ({ predictions, currentPhase, style }) => {
  return (
    <View style={[styles.container, style]}> 
      <Text style={styles.heading}>Monthly Cycle Phases</Text>
      {phaseOrder.map((phaseKey) => {
        const palette = PHASE_PALETTE[phaseKey];
        const metaText = buildMetaText(phaseKey, predictions);
        const isActive = currentPhase === phaseKey;

        return (
          <View key={phaseKey} style={styles.row}>
            <View style={[styles.colorSwatch, { backgroundColor: palette.color }]} />
            <View style={styles.textBlock}>
              <Text style={[styles.phaseTitle, isActive && styles.activePhase]}>{palette.label}</Text>
              <Text style={styles.phaseTagline}>{palette.summary}</Text>
              {!!metaText && <Text style={styles.meta}>{metaText}</Text>}
            </View>
          </View>
        );
      })}
      <Text style={styles.note}>Predicted dates update automatically whenever new period data is logged.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 4,
  },
  textBlock: {
    flex: 1,
  },
  phaseTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  activePhase: {
    color: Colors.primary,
  },
  phaseTagline: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  note: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});

export default PhaseGuide;

