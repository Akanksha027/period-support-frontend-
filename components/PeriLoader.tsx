import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

const animationSource = require('../assets/animations/peri-animation.json');

type LoaderSize = 'small' | 'medium' | 'large';

type PeriLoaderProps = {
  size?: LoaderSize | number;
  containerStyle?: ViewStyle;
};

const SIZE_MAP: Record<LoaderSize, number> = {
  small: 36,
  medium: 64,
  large: 200,
};

export function PeriLoader({ size = 'medium', containerStyle }: PeriLoaderProps) {
  const dimension = typeof size === 'number' ? size : SIZE_MAP[size];

  return (
    <View style={[styles.container, { width: dimension, height: dimension }, containerStyle]}>
      <LottieView
        source={animationSource}
        autoPlay
        loop
        style={{ width: dimension, height: dimension }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PeriLoader;

