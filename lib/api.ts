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

// Helper function to get Clerk token and add to request
let getClerkToken: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(tokenGetter: () => Promise<string | null>) {
  getClerkToken = tokenGetter;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Add request interceptor for debugging and auth token
api.interceptors.request.use(
  async (config) => {
    // Add auth token if available
    try {
      if (getClerkToken) {
        const token = await getClerkToken();
        if (token && !config.headers?.Authorization) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch (error) {
      // Silent - token getter might not be ready yet
    }

    // Log request for debugging
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

// Reminders API functions
export interface Reminder {
  id: string;
  message: string;
  phase?: string | null;
  cycleDay?: number | null;
  sentAt: string;
}

export interface ReminderStatus {
  enabled: boolean;
  lastReminder: Reminder | null;
}

export const getReminderStatus = async (): Promise<ReminderStatus> => {
  try {
    const response = await api.get('/api/reminders/status');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 404) {
      return { enabled: false, lastReminder: null };
    }
    throw error;
  }
};

export interface GenerateReminderResponse {
  success: boolean;
  reminder: Reminder | null;
  message?: string;
}

export const generateReminder = async (): Promise<GenerateReminderResponse> => {
  try {
    const response = await api.post('/api/reminders/generate');
    return {
      success: response.data.success || false,
      reminder: response.data.reminder || null,
      message: response.data.message || null,
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Please log in to generate reminders');
    }
    throw error;
  }
};

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

// Period API functions
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
  return response.data.period || response.data;
};

export const updatePeriod = async (id: string, data: {
  startDate?: string;
  endDate?: string | null;
  flowLevel?: 'light' | 'medium' | 'heavy' | null;
}): Promise<Period> => {
  const response = await api.patch(`/api/periods/${id}`, data);
  return response.data.period || response.data;
};

export const deletePeriod = async (id: string): Promise<void> => {
  await api.delete(`/api/periods/${id}`);
};

// User API functions
export interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  clerkId: string;
  userType: 'SELF' | 'OTHER';
  viewedUserId?: string | null;
  viewedUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  settings?: UserSettings | null;
}

export const getUserInfo = async (): Promise<UserInfo | null> => {
  try {
    const response = await api.get('/api/user');
    return response.data.user || null;
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

// Settings API functions
export const getSettings = async (): Promise<UserSettings | null> => {
  try {
    const response = await api.get('/api/user/settings');
    return response.data.settings || null;
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

// Symptoms API functions
export const getSymptoms = async (startDate?: string, endDate?: string): Promise<Symptom[]> => {
  const params: any = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  
  const response = await api.get('/api/symptoms', { params });
  return response.data.symptoms || [];
};

export const createSymptom = async (data: {
  date: string;
  type: string;
  severity?: number;
}): Promise<Symptom> => {
  const response = await api.post('/api/symptoms', {
    date: data.date,
    type: data.type,
    severity: data.severity || 3,
  });
  return response.data.symptom || response.data;
};

export const deleteSymptom = async (id: string): Promise<void> => {
  await api.delete(`/api/symptoms/${id}`);
};

// Moods API functions
export const getMoods = async (startDate?: string, endDate?: string): Promise<Mood[]> => {
  const params: any = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  
  const response = await api.get('/api/moods', { params });
  return response.data.moods || [];
};

export const createMood = async (data: {
  date: string;
  type: string;
}): Promise<Mood> => {
  const response = await api.post('/api/moods', {
    date: data.date,
    type: data.type,
  });
  return response.data.mood || response.data;
};

export const deleteMood = async (id: string): Promise<void> => {
  await api.delete(`/api/moods/${id}`);
};

// Chat API function
export const chatWithAI = async (messages: Array<{ role: string; content: string }>, symptoms?: any[]): Promise<string> => {
  const response = await api.post('/api/chat', {
    messages,
    symptoms,
  });
  return response.data.response || response.data.message || 'I understand your question. Let me help you with that.';
};
