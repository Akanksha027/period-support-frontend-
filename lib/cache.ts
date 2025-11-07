import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_STORAGE_KEY = 'APP_CACHE_V1';

type CacheEntry<T> = {
  value: T;
  timestamp: number;
};

const cacheStore = new Map<string, CacheEntry<any>>();
let cacheHydrated = false;

export function buildCacheKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part === null || part === undefined ? 'null' : String(part)))
    .join('::');
}

async function hydrateCache() {
  if (cacheHydrated) return;
  try {
    const stored = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, CacheEntry<any>>;
      Object.entries(parsed).forEach(([key, entry]) => {
        if (entry && typeof entry === 'object' && entry.hasOwnProperty('value')) {
          cacheStore.set(key, entry);
        }
      });
    }
  } catch (error) {
    console.warn('[Cache] Failed to hydrate cache from storage:', error);
  } finally {
    cacheHydrated = true;
  }
}

async function persistCache() {
  try {
    const serialized = JSON.stringify(Object.fromEntries(cacheStore));
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, serialized);
  } catch (error) {
    console.warn('[Cache] Failed to persist cache:', error);
  }
}

export async function getCachedData<T>(key: string): Promise<T | undefined> {
  if (!cacheHydrated) {
    await hydrateCache();
  }
  const entry = cacheStore.get(key);
  return entry ? (entry.value as T) : undefined;
}

export async function setCachedData<T>(key: string, value: T): Promise<void> {
  if (!cacheHydrated) {
    await hydrateCache();
  }
  cacheStore.set(key, {
    value,
    timestamp: Date.now(),
  });
  await persistCache();
}

export async function clearCachedData(key?: string) {
  if (!cacheHydrated) {
    await hydrateCache();
  }
  if (key) {
    cacheStore.delete(key);
  } else {
    cacheStore.clear();
  }
  await persistCache();
}

export async function getCacheTimestamp(key: string): Promise<number | undefined> {
  if (!cacheHydrated) {
    await hydrateCache();
  }
  const entry = cacheStore.get(key);
  return entry?.timestamp;
}

