import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native'
import { Tabs, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { usePhase } from '../../contexts/PhaseContext'
import { PHASE_PALETTE } from '../../constants/phasePalette'

const { width } = Dimensions.get('window')

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const accentColor = '#FFFFFF'

  const tabs = [
    {
      name: 'home',
      key: 'home',
      icon: 'home-outline',
    },
    
   
    {
      name: 'calendar',
      key: 'calendar',
      icon: 'calendar-outline',
    },
    {
      name: 'chat',
      key: 'chat',
      icon: 'sparkles-outline',
    },
    {
      name: 'phases',
      key: 'phases',
      icon: 'book-outline',
    },
    {
      name: 'profile',
      key: 'profile',
      icon: 'person-outline',
    },
  ]

  const isActive = (routeName: string) => {
    const route = state.routes.find(r => r.name === routeName)
    if (!route) return false
    const isFocused = state.index === state.routes.indexOf(route)
    return isFocused || pathname === route.path || pathname?.includes(routeName)
  }

  const handleTabPress = (routeName: string) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeName,
      canPreventDefault: true,
    })

    if (!event.defaultPrevented) {
      navigation.navigate(routeName)
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom === 0 ? 12 : insets.bottom }]}>
      <View style={[styles.shadowWrapper, { shadowColor: '#00000040' }]}>
        <View
          style={[
            styles.tabPill,
            { borderColor: 'transparent' },
          ]}
        >
          {tabs.map((tab) => {
            const active = isActive(tab.key)

            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={styles.pillButton}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={24}
                  color={active ? accentColor : 'rgba(255,255,255,0.6)'}
                  style={styles.icon}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="phases" options={{ title: 'Cycle Guide' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="chat" options={{ title: 'AI Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shadowWrapper: {
    width: width - 64,
    borderRadius: 30,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 0,
    backgroundColor: '#3D3D3D',
  },
  pillButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  icon: {
    opacity: 1,
  },
})