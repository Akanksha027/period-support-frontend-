import { ViewMode } from './api'

// Temporary no-op implementations while push notifications are disabled.

export async function registerForPushNotifications(_context: {
  mode: ViewMode
  viewedUserId?: string | null
}): Promise<string | null> {
  console.log('[Notifications] Push registration is currently disabled.')
  return null
}

export async function clearStoredPushToken(): Promise<void> {
  console.log('[Notifications] Clearing stored push tokens skipped (notifications disabled).')
}

