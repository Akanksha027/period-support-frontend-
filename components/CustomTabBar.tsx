import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { usePhase } from '../contexts/PhaseContext';

const { width } = Dimensions.get('window');

export default React.memo(function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { phaseColors } = usePhase();

  const tabs = useMemo(() => [
    {
      name: 'home',
      icon: 'home' as const,
      route: '/(tabs)/home',
      key: 'home',
    },
    {
      name: 'calendar',
      icon: 'calendar' as const,
      route: '/(tabs)/calendar',
      key: 'calendar',
    },
    {
      name: 'profile',
      icon: 'person' as const,
      route: '/(tabs)/profile',
      key: 'profile',
    },
  ], []);

  const isActive = useMemo(() => {
    return (routeName: string) => {
      const route = state.routes.find(r => r.name === routeName);
      if (!route) return false;
      const isFocused = state.index === state.routes.indexOf(route);
      return isFocused || pathname === route.path || pathname?.includes(routeName);
    };
  }, [state, pathname]);

  const handleTabPress = useMemo(() => {
    return (routeName: string) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeName,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    };
  }, [navigation]);

  const handleChatPress = useMemo(() => {
    return () => {
      router.push('/(tabs)/chat');
    };
  }, [router]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabBar}>
        <View style={styles.tabsContainer}>
          {/* Home tab */}
          {tabs.slice(0, 1).map((tab) => {
            const active = isActive(tab.key);
            return (
              <View key={tab.name} style={styles.tabWrapper}>
                <View style={styles.glassyBlurCircle} />
                <TouchableOpacity
                  onPress={() => handleTabPress(tab.key)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={
                      active
                        ? [phaseColors.tabActiveBackground, phaseColors.tabActiveBackground]
                        : [phaseColors.tabBackground, phaseColors.tabBackground]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabGradient}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={32}
                      color={active ? phaseColors.tabActiveIcon : phaseColors.tabIcon}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Calendar tab */}
          {tabs.slice(1, 2).map((tab) => {
            const active = isActive(tab.key);
            return (
              <View key={tab.name} style={styles.tabWrapper}>
                <View style={styles.glassyBlurCircle} />
                <TouchableOpacity
                  onPress={() => handleTabPress(tab.key)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={
                      active
                        ? [phaseColors.tabActiveBackground, phaseColors.tabActiveBackground]
                        : [phaseColors.tabBackground, phaseColors.tabBackground]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabGradient}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={32}
                      color={active ? phaseColors.tabActiveIcon : phaseColors.tabIcon}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Center AI Chatbot Button */}
          <View style={styles.chatWrapper}>
            <View style={styles.chatGlassyBlurCircle} />
            <TouchableOpacity
              onPress={handleChatPress}
              style={styles.chatButton}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={phaseColors.chatButtonGradient as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.chatGradient}
              >
                <View style={styles.chatGlow} />
                <View style={styles.chatButtonInner}>
                  <Ionicons name="sparkles" size={32} color={Colors.white} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Profile tab */}
          {tabs.slice(2).map((tab) => {
            const active = isActive(tab.key);
            return (
              <View key={tab.name} style={styles.tabWrapper}>
                <View style={styles.glassyBlurCircle} />
                <TouchableOpacity
                  onPress={() => handleTabPress(tab.key)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={
                      active
                        ? [phaseColors.tabActiveBackground, phaseColors.tabActiveBackground]
                        : [phaseColors.tabBackground, phaseColors.tabBackground]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabGradient}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={32}
                      color={active ? phaseColors.tabActiveIcon : phaseColors.tabIcon}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: width,
    height: 80,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: -8,
  },
  tabWrapper: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  tabButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
    transform: [{ translateY: -4 }],
  },
  tabButtonActive: {
    transform: [{ translateY: -6 }, { scale: 1.05 }],
  },
  tabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    transform: [{ translateY: -4 }],
  },
  glassyBlurCircle: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(200, 200, 200, 0.4)',
    zIndex: 1,
    shadowColor: 'rgba(180, 180, 180, 0.5)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    opacity: 0.75,
    top: '50%',
    left: '50%',
    marginTop: -53,
    marginLeft: -43,
  },
  chatWrapper: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  chatButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
    transform: [{ translateY: -6 }],
  },
  chatGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
    borderWidth: 0,
  },
  chatGlassyBlurCircle: {
    position: 'absolute',
    width: 94,
    height: 101,
    borderRadius: 47,
    backgroundColor: 'rgba(200, 200, 200, 0.45)',
    zIndex: 1,
    shadowColor: 'rgba(180, 180, 180, 0.6)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    opacity: 0.8,
    top: '50%',
    left: '50%',
    marginTop: -56.5,
    marginLeft: -47,
  },
  chatButtonInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  chatGlow: {
    position: 'absolute',
    width: '115%',
    height: '115%',
    borderRadius: 41,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 0,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
});

