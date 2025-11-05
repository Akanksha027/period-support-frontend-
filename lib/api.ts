import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '@clerk/clerk-expo';

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
  return 'https://period-tracking-backend.vercel.app';
}

const API_URL = resolveApiBase();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Helper function to get Clerk token and add to request
let getClerkToken: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(tokenGetter: () => Promise<string | null>) {
  getClerkToken = tokenGetter;
}

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  try {
    if (getClerkToken) {
      const token = await getClerkToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (error) {
    // Silent - token getter might not be ready yet
  }
  return config;
});

// Add response interceptor for better error logging
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('[API] Request timeout after 30s:', error.config?.url);
    } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
      console.error('[API] Network Error - Cannot reach backend at:', API_URL);
    } else if (error.response?.status === 401) {
      // Silent - 401 is expected when user is not authenticated
    } else if (error.response) {
      console.error('[API] Request failed:', error.message, error.config?.url);
      console.error('[API] Status:', error.response.status);
      console.error('[API] Response:', error.response.data);
    } else {
      console.error('[API] Unknown error:', error.message, error.config?.url);
    }
    return Promise.reject(error);
  }
);

// Type definitions
export interface Period {
  id: string;
  startDate: string;
  endDate: string | null;
  flowLevel: 'light' | 'medium' | 'heavy' | null;
  createdAt: string;
  updatedAt: string;
}

export interface Symptom {
  id: string;
  date: string;
  type: string;
  severity: number;
  createdAt: string;
}

export interface Mood {
  id: string;
  date: string;
  type: string;
  createdAt: string;
}

export interface Note {
  id: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  id?: string;
  userId?: string;
  averageCycleLength: number;
  averagePeriodLength: number;
  periodDuration?: number;
  lastPeriodDate?: string | null;
  birthYear?: number | null;
  reminderEnabled?: boolean;
  reminderDaysBefore?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Login for someone else API functions
export const loginForOtherAPI = {
  verifyCredentials: async (email: string) => {
    const response = await api.post('/api/login-for-other/verify-credentials', { email });
    return response.data;
  },

  sendOTP: async (email: string) => {
    const response = await api.post('/api/login-for-other/send-otp', { email });
    return response.data;
  },

  verifyOTP: async (email: string, otp: string) => {
    const response = await api.post('/api/login-for-other/verify-otp', { email, otp });
    return response.data;
  },

  completeLogin: async (email: string, tempToken: string, viewerIdentifier?: string) => {
    const response = await api.post('/api/login-for-other/complete-login', {
      email,
      tempToken,
      viewerIdentifier,
    });
    return response.data;
  },
};

// User API
export const getUser = async () => {
  const response = await api.get('/api/user');
  return response.data;
};

export const updateUser = async (name: string) => {
  const response = await api.patch('/api/user', { name });
  return response.data;
};

// Period API
export const getPeriods = async (): Promise<Period[]> => {
  const response = await api.get('/api/periods');
  return response.data.periods || [];
};

export const createPeriod = async (data: {
  startDate: string;
  endDate?: string | null;
  flowLevel?: 'light' | 'medium' | 'heavy' | null;
}): Promise<Period> => {
  const response = await api.post('/api/periods', data);
  return response.data.period;
};

export const updatePeriod = async (id: string, data: {
  startDate?: string;
  endDate?: string | null;
  flowLevel?: 'light' | 'medium' | 'heavy' | null;
}): Promise<Period> => {
  const response = await api.patch(`/api/periods/${id}`, data);
  return response.data.period;
};

export const deletePeriod = async (id: string) => {
  const response = await api.delete(`/api/periods/${id}`);
  return response.data;
};

// Symptom API
export const getSymptoms = async (startDate?: string, endDate?: string): Promise<Symptom[]> => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const response = await api.get(`/api/symptoms?${params}`);
  return response.data.symptoms || [];
};

export const createSymptom = async (data: {
  date: string;
  type: string;
  severity: number;
}): Promise<Symptom> => {
  const response = await api.post('/api/symptoms', data);
  return response.data.symptom;
};

export const deleteSymptom = async (id: string) => {
  const response = await api.delete(`/api/symptoms/${id}`);
  return response.data;
};

// Mood API
export const getMoods = async (startDate?: string, endDate?: string): Promise<Mood[]> => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const response = await api.get(`/api/moods?${params}`);
  return response.data.moods || [];
};

export const createMood = async (data: {
  date: string;
  type: string;
}): Promise<Mood> => {
  const response = await api.post('/api/moods', data);
  return response.data.mood;
};

export const deleteMood = async (id: string) => {
  const response = await api.delete(`/api/moods/${id}`);
  return response.data;
};

// Settings API
export const getSettings = async (): Promise<UserSettings | null> => {
  try {
    const response = await api.get('/api/user/settings');
    return response.data.settings || null;
  } catch (error: any) {
    if (error.response?.status === 401) {
      return null;
    }
    throw error;
  }
};

export const updateSettings = async (settings: Partial<UserSettings>): Promise<UserSettings> => {
  const response = await api.patch('/api/user/settings', settings);
  return response.data.settings;
};

// AI Chat API (placeholder - will be implemented based on frontend folder)
export const chatWithAI = async (message: string, context?: any): Promise<string> => {
  // This will be implemented based on the frontend chat functionality
  // For now, return a placeholder response
  return 'AI chat functionality coming soon';
};
