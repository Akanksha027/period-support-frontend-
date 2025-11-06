import axios from 'axios';
import Constants from 'expo-constants';

const extra =
  ((Constants as any)?.expoConfig?.extra as any) ||
  ((Constants as any)?.manifest?.extra as any) ||
  ((Constants as any)?.manifest2?.extra as any) ||
  {};

function resolveApiBase(): string {
  // Default to deployed backend URL
  const DEFAULT_API_URL = 'https://period-tracking-backend.vercel.app';

  // Priority 1: From app.config.js extra.API_URL (for local development override)
  if (extra?.API_URL) {
    return extra.API_URL as string;
  }

  // Priority 2: From environment variable (for local development override)
  const fromEnv = process.env.EXPO_PUBLIC_API_URL as string;
  if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) {
    return fromEnv;
  }

  // Priority 3: Try to infer LAN IP from debuggerHost/hostUri (for local development)
  const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest?.debuggerHost;
  if (typeof hostUri === 'string') {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost') {
      return `http://${ip}:3000`;
    }
  }

  // Default: Use deployed backend URL
  return DEFAULT_API_URL;
}

const API_URL = resolveApiBase();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('[API Request]', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      hasAuth: !!config.headers?.Authorization,
      hasBody: !!config.data,
      bodyKeys: config.data ? Object.keys(config.data) : [],
      queryParams: config.params,
    });
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('[API Response]', {
      status: response.status,
      url: response.config.url,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.error('[API Response Error]', {
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      url: error?.config?.url,
      data: error?.response?.data,
      message: error?.message,
    });
    return Promise.reject(error);
  }
);

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

