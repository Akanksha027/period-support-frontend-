import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken, ViewMode } from './api';

type StoredPushToken = {
  token: string;
  mode: ViewMode;
  viewedUserId: string | null;
};

const PUSH_TOKEN_STORAGE_KEY = 'PUSH_TOKEN_CACHE_V1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function resolveProjectId(): string | undefined {
  const easProjectId =
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId ??
    (Constants as any)?.expoConfig?.eas?.projectId ??
    (Constants as any)?.manifest?.extra?.eas?.projectId;

  return typeof easProjectId === 'string' && easProjectId.length > 0 ? easProjectId : undefined;
}

async function getCachedPushToken(): Promise<StoredPushToken | null> {
  try {
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as StoredPushToken;
    if (parsed?.token) {
      return parsed;
    }
  } catch (error) {
    console.warn('[Notifications] Failed to parse stored push token', error);
  }
  return null;
}

async function cachePushToken(data: StoredPushToken) {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[Notifications] Failed to store push token', error);
  }
}

export async function clearStoredPushToken() {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn('[Notifications] Failed to clear stored push token', error);
  }
}

export async function registerForPushNotifications(context: {
  mode: ViewMode;
  viewedUserId?: string | null;
}): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('[Notifications] Push notifications require a physical device');
      return null;
    }

    const existingPermissions = await Notifications.getPermissionsAsync();
    let granted = existingPermissions.granted || existingPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) {
      const request = await Notifications.requestPermissionsAsync();
      granted = request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!granted) {
      console.log('[Notifications] Permission not granted');
      return null;
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn('[Notifications] Missing EAS projectId. Push token cannot be generated.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;

    if (!expoPushToken) {
      console.warn('[Notifications] Failed to obtain Expo push token');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF4081',
        sound: 'default',
        enableLights: true,
      });
    }

    const viewedUserId = context.viewedUserId ?? null;
    const cached = await getCachedPushToken();

    if (
      cached &&
      cached.token === expoPushToken &&
      cached.mode === context.mode &&
      cached.viewedUserId === viewedUserId
    ) {
      console.log('[Notifications] Push token already registered with current context');
      return expoPushToken;
    }

    try {
      await registerPushToken({
        expoPushToken,
        deviceType: Platform.OS,
        mode: context.mode,
        viewedUserId,
      });
      await cachePushToken({ token: expoPushToken, mode: context.mode, viewedUserId });
      console.log('[Notifications] Push token registered successfully');
    } catch (error) {
      console.warn('[Notifications] Failed to register push token with backend', error);
    }

    return expoPushToken;
  } catch (error) {
    console.warn('[Notifications] Unexpected error while registering push notifications', error);
    return null;
  }
}

