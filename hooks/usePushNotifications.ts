import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken, RegisterPushTokenPayload, getUserInfo } from '../lib/api';
import { useAuth } from '@clerk/clerk-expo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;

    registerForPushNotificationsAsync()
      .then(async token => {
        if (token) {
          setExpoPushToken(token);
          try {
            const userInfo = await getUserInfo();
            const payload: RegisterPushTokenPayload = {
              expoPushToken: token,
              deviceType: Platform.OS,
              mode: userInfo?.userType || 'SELF',
              viewedUserId: userInfo?.viewedUser?.id || undefined,
              timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            };
            await registerPushToken(payload);
            console.log('Push token successfully registered with backend:', payload.mode);
          } catch (err) {
            console.error('Failed to register push token with backend:', err);
          }
        }
      })
      .catch(err => console.error('Error getting push token:', err));

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      // Optional: Handle routing based on notification payload here
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isSignedIn]);

  return { expoPushToken, notification };
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF1744',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return undefined;
    }
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data;
    } catch (e) {
      console.error('Error in getExpoPushTokenAsync:', e);
      // Fallback for development without EAS project ID
      try {
        token = (await Notifications.getExpoPushTokenAsync()).data;
      } catch (innerError) {
        console.error('Fallback push token generation failed:', innerError);
      }
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
