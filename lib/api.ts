import axios from 'axios';
import Constants from 'expo-constants';

const extra =
  ((Constants as any)?.expoConfig?.extra as any) ||
  ((Constants as any)?.manifest?.extra as any) ||
  ((Constants as any)?.manifest2?.extra as any) ||
  {};

function resolveApiBase(): string {
  // Priority 1: From app.config.js extra.API_URL
  if (extra?.API_URL) {
    return extra.API_URL as string;
  }

  // Priority 2: From environment variable
  const fromEnv = process.env.EXPO_PUBLIC_API_URL as string;
  if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) {
    return fromEnv;
  }

  // Priority 3: Try to infer LAN IP from debuggerHost/hostUri
  const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest?.debuggerHost;
  if (typeof hostUri === 'string') {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost') {
      return `http://${ip}:3000`;
    }
  }

  // Fallback
// Fallback
return 'https://period-tracking-backend.vercel.app'; // Changed from localhost:3000
}

const API_URL = resolveApiBase();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Login for someone else API functions
export const loginForOtherAPI = {
  // Verify credentials (email only - no password required)
  verifyCredentials: async (email: string) => {
    const response = await api.post('/api/login-for-other/verify-credentials', {
      email,
    });
    return response.data;
  },

  // Send OTP to email
  sendOTP: async (email: string) => {
    const response = await api.post('/api/login-for-other/send-otp', {
      email,
    });
    return response.data;
  },

  // Verify OTP
  verifyOTP: async (email: string, otp: string) => {
    const response = await api.post('/api/login-for-other/verify-otp', {
      email,
      otp,
    });
    return response.data;
  },

  // Complete login - creates the OTHER user record
  completeLogin: async (email: string, tempToken: string, viewerIdentifier?: string) => {
    const response = await api.post('/api/login-for-other/complete-login', {
      email,
      tempToken,
      viewerIdentifier,
    });
    return response.data;
  },
};

