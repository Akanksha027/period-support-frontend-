import React, { useState, useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, DeviceEventEmitter, Platform } from 'react-native';
import { Colors } from '../constants/Colors';

export const Toast = () => {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error'>('success');
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const listener = DeviceEventEmitter.addListener('showToast', (data) => {
      setMessage(data.msg);
      setType(data.type || 'success');
      
      opacity.setValue(0);
      
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        // setMessage(''); // Optional
      });
    });
    
    return () => listener.remove();
  }, [opacity]);

  return (
    <Animated.View style={[
      styles.container, 
      { opacity },
      type === 'error' ? styles.errorContainer : styles.successContainer
    ]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

export const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
  DeviceEventEmitter.emit('showToast', { msg, type });
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 200,
  },
  successContainer: {
    backgroundColor: Colors.primary,
  },
  errorContainer: {
    backgroundColor: Colors.error,
  },
  text: { 
    color: 'white', 
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center'
  }
});
