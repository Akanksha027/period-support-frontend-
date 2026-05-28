import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Configuration ────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'cache_v2_';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes default TTL
const MAX_CACHE_ENTRIES = 100; // Prevent unbounded growth

// TTL presets for different data types (in milliseconds)
export const CacheTTL = {
  SHORT: 2 * 60 * 1000,     // 2 min  — rapidly changing data (moods, symptoms logged today)
  MEDIUM: 5 * 60 * 1000,    // 5 min  — standard API data (periods, settings)
  LONG: 30 * 60 * 1000,     // 30 min — slow-changing data (user info)
  VERY_LONG: 24 * 60 * 60 * 1000, // 24h — AI predictions, computed results
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

// ─── In-memory layer (hot cache) ──────────────────────────────────────────────
const memoryCache = new Map<string, CacheEntry<any>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function storageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

function isExpired(entry: CacheEntry<any>): boolean {
  return Date.now() - entry.timestamp > entry.ttl;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a cache key from an array of parts.
 * Produces deterministic keys: `buildCacheKey(['periods', 'SELF', 'user_123'])` → `"periods::SELF::user_123"`
 */
export function buildCacheKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part === null || part === undefined ? 'null' : String(part)))
    .join('::');
}

/**
 * Get data from cache. Returns `undefined` if not found or expired.
 *
 * Lookup order:
 * 1. In-memory map (instant, no I/O)
 * 2. AsyncStorage (persisted across app restarts)
 *
 * Expired entries are silently pruned.
 */
export async function getCachedData<T>(key: string, returnStale = false): Promise<T | undefined> {
  // 1. Try in-memory first (fastest)
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (!isExpired(memEntry)) {
      return memEntry.value as T;
    }
    if (returnStale) {
      return memEntry.value as T;
    }
    // Expired — remove from memory
    memoryCache.delete(key);
  }

  // 2. Try AsyncStorage (persisted)
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (!isExpired(entry)) {
        // Promote back to memory cache for next access
        memoryCache.set(key, entry);
        return entry.value;
      }
      if (returnStale) {
        return entry.value;
      }
      // Expired — clean up AsyncStorage in background
      AsyncStorage.removeItem(storageKey(key)).catch(() => {});
    }
  } catch (error) {
    console.warn('[Cache] Read error for key', key, error);
  }

  return undefined;
}

/**
 * Store data in cache (both in-memory and AsyncStorage).
 *
 * @param key  Cache key (use `buildCacheKey` to construct)
 * @param value  Data to cache
 * @param ttl  Time-to-live in ms (default: 5 minutes). Use `CacheTTL` presets.
 */
export async function setCachedData<T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_TTL_MS
): Promise<void> {
  const entry: CacheEntry<T> = {
    value,
    timestamp: Date.now(),
    ttl,
  };

  // 1. Always set in memory (instant for next read)
  memoryCache.set(key, entry);

  // 2. Persist to AsyncStorage (fire-and-forget for speed)
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch (error) {
    console.warn('[Cache] Write error for key', key, error);
  }

  // 3. Evict if memory cache is too large
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    evictOldestEntries();
  }
}

/**
 * Remove a specific key from both memory and AsyncStorage.
 * If no key is provided, clears ALL cached data.
 */
export async function clearCachedData(key?: string): Promise<void> {
  if (key) {
    memoryCache.delete(key);
    try {
      await AsyncStorage.removeItem(storageKey(key));
    } catch (error) {
      console.warn('[Cache] Clear error for key', key, error);
    }
  } else {
    // Clear everything with our prefix
    memoryCache.clear();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (error) {
      console.warn('[Cache] Clear all error:', error);
    }
  }
}

/**
 * Clear all cache entries whose key contains the given substring.
 * Useful for invalidating all data for a specific scope (e.g., user switch).
 *
 * Example: `clearCacheByPattern('SELF::user_123')` removes all entries for that user.
 */
export async function clearCacheByPattern(pattern: string): Promise<void> {
  // Memory cache
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }

  // AsyncStorage
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const matchingKeys = allKeys.filter(
      (k) => k.startsWith(CACHE_PREFIX) && k.includes(pattern)
    );
    if (matchingKeys.length > 0) {
      await AsyncStorage.multiRemove(matchingKeys);
    }
  } catch (error) {
    console.warn('[Cache] Pattern clear error:', error);
  }
}

/**
 * Get the timestamp of when a cache entry was stored.
 */
export async function getCacheTimestamp(key: string): Promise<number | undefined> {
  const memEntry = memoryCache.get(key);
  if (memEntry) return memEntry.timestamp;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (raw) {
      const entry: CacheEntry<any> = JSON.parse(raw);
      return entry.timestamp;
    }
  } catch {
    // ignore
  }
  return undefined;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Evict the oldest entries when memory cache exceeds MAX_CACHE_ENTRIES.
 */
function evictOldestEntries(): void {
  const entries = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );

  // Remove oldest 20%
  const removeCount = Math.ceil(entries.length * 0.2);
  for (let i = 0; i < removeCount; i++) {
    memoryCache.delete(entries[i][0]);
  }
}
