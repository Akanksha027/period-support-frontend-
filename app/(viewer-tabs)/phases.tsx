import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PhaseEducation } from '../../components/PhaseEducation'

export default function ViewerPhasesScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PhaseEducation />
    </SafeAreaView>
  )
}
