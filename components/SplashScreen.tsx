import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, Image } from 'react-native';
import LottieView from 'lottie-react-native';

const loadingAnimation = require('../assets/animations/peri-animation.json');

const LOGO_ANIMATION_DURATION = 10000;

export default function SplashScreen() {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [showLottie, setShowLottie] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: LOGO_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setShowLottie(true);
    });
  }, [opacity, scale]);

  return (
    <View style={styles.container}>
      {!showLottie && (
        <Animated.View style={[styles.logoWrapper, { transform: [{ scale }], opacity }]}> 
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
      )}

      {showLottie && (
        <View style={styles.lottieWrapper}>
          <LottieView
            source={loadingAnimation}
            autoPlay
            loop
            style={styles.lottie}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoWrapper: {
    width: 280,
    height: 280,
    borderRadius: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '90%',
    height: '90%',
  },
  lottieWrapper: {
    width: 140,
    height: 140,
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
});
