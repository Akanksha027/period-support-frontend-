import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAIPredictions } from './api';
import { calculatePredictions, CyclePredictions } from './periodCalculations';
import { Period, UserSettings } from './api';

// AI Response interface (from Gemini)
export interface AIResponse {
    cycle_analysis: {
        average_cycle_length: number;
        cycle_variance: string;
        cycle_regularity: string;
        total_cycles_analyzed: number;
    };
    next_periods: Array<{
        cycle_number: number;
        start_date: string;
        end_date: string;
        confidence: number;
        notes: string;
    }>;
    predictions: {
        next_ovulation: {
            date: string;
            confidence: number;
            fertile_window_start: string;
            fertile_window_end: string;
        };
        pms_likelihood: {
            start_date: string;
            confidence: number;
            symptoms_to_watch: string[];
        };
    };
    health_insights?: {
        recommendations?: string[];
    };
    generated_at: string;
    model: string;
}

// Cached predictions with metadata
interface CachedPredictions {
    ai: AIResponse | null;
    legacy: CyclePredictions;
    cachedAt: number;
    userId: string;
}

const CACHE_KEY = 'ai_predictions_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Convert AI response to legacy CyclePredictions format for backward compatibility
 */
export function convertAIToLegacyFormat(
    aiResponse: AIResponse | null,
    fallback: CyclePredictions
): CyclePredictions {
    if (!aiResponse || !aiResponse.next_periods || aiResponse.next_periods.length === 0) {
        return fallback;
    }

    try {
        const nextPeriod = aiResponse.next_periods[0];
        const nextOvulation = aiResponse.predictions?.next_ovulation;
        const pms = aiResponse.predictions?.pms_likelihood;

        return {
            nextPeriodDate: nextPeriod?.start_date ? new Date(nextPeriod.start_date) : fallback.nextPeriodDate,
            ovulationDate: nextOvulation?.date ? new Date(nextOvulation.date) : fallback.ovulationDate,
            fertileWindowStart: nextOvulation?.fertile_window_start
                ? new Date(nextOvulation.fertile_window_start)
                : fallback.fertileWindowStart,
            fertileWindowEnd: nextOvulation?.fertile_window_end
                ? new Date(nextOvulation.fertile_window_end)
                : fallback.fertileWindowEnd,
            pmsStart: pms?.start_date ? new Date(pms.start_date) : fallback.pmsStart,
            pmsEnd: nextPeriod?.start_date
                ? new Date(new Date(nextPeriod.start_date).getTime() - 24 * 60 * 60 * 1000)
                : fallback.pmsEnd,
            cycleLength: aiResponse.cycle_analysis?.average_cycle_length || fallback.cycleLength,
            periodLength: nextPeriod?.end_date && nextPeriod?.start_date
                ? Math.ceil((new Date(nextPeriod.end_date).getTime() - new Date(nextPeriod.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
                : fallback.periodLength,
            confidence: nextPeriod?.confidence >= 80 ? 'high' : nextPeriod?.confidence >= 50 ? 'medium' : 'low',
        };
    } catch (error) {
        console.error('[AI Predictions] Error converting AI to legacy format:', error);
        return fallback;
    }
}

/**
 * Get cached predictions from AsyncStorage
 */
async function getCachedPredictions(userId: string): Promise<CachedPredictions | null> {
    try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const parsed: CachedPredictions = JSON.parse(cached);

        // Verify it's for the same user
        if (parsed.userId !== userId) {
            console.log('[AI Predictions] Cache is for different user, ignoring');
            return null;
        }

        // Check if cache is expired
        const now = Date.now();
        const age = now - parsed.cachedAt;

        if (age > CACHE_DURATION) {
            console.log('[AI Predictions] Cache expired', { age: Math.round(age / 1000 / 60), minutes: 'minutes' });
            return null;
        }

        console.log('[AI Predictions] Using cached predictions', { age: Math.round(age / 1000 / 60), minutes: 'minutes old' });
        return parsed;
    } catch (error) {
        console.error('[AI Predictions] Error reading cache:', error);
        return null;
    }
}

/**
 * Save predictions to AsyncStorage
 */
async function savePredictionsToCache(
    aiResponse: AIResponse | null,
    legacy: CyclePredictions,
    userId: string
): Promise<void> {
    try {
        const cache: CachedPredictions = {
            ai: aiResponse,
            legacy,
            cachedAt: Date.now(),
            userId,
        };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log('[AI Predictions] Saved to cache');
    } catch (error) {
        console.error('[AI Predictions] Error saving cache:', error);
    }
}

/**
 * Invalidate (clear) the predictions cache
 */
export async function invalidatePredictionsCache(): Promise<void> {
    try {
        await AsyncStorage.removeItem(CACHE_KEY);
        console.log('[AI Predictions] Cache invalidated');
    } catch (error) {
        console.error('[AI Predictions] Error invalidating cache:', error);
    }
}

/**
 * Fetch fresh AI predictions from backend
 */
async function fetchAIPredictions(): Promise<AIResponse | null> {
    try {
        console.log('[AI Predictions] Fetching from backend...');
        const response = await getAIPredictions();

        if (response.success && response.predictions) {
            console.log('[AI Predictions] Received AI predictions');
            return response.predictions as AIResponse;
        }

        console.warn('[AI Predictions] Backend returned no predictions');
        return null;
    } catch (error) {
        console.error('[AI Predictions] Error fetching AI predictions:', error);
        return null;
    }
}

/**
 * React hook for using AI predictions with caching and background refresh
 */
export function useAIPredictions(
    periods: Period[],
    settings: UserSettings | null,
    userId: string | null
) {
    // Calculate static fallback immediately (synchronous)
    const staticPredictions = calculatePredictions(periods, settings);

    const [predictions, setPredictions] = useState<CyclePredictions>(staticPredictions);
    const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [isUsingAI, setIsUsingAI] = useState(false);

    // Track if we've already loaded for this user
    const loadedUserRef = useRef<string | null>(null);
    const isLoadingRef = useRef(false);

    /**
     * Load predictions (from cache or fetch)
     */
    const loadPredictions = useCallback(async (forceRefresh = false) => {
        if (!userId || isLoadingRef.current) return;

        isLoadingRef.current = true;

        try {
            // Always show static predictions immediately (no lag!)
            setPredictions(staticPredictions);
            setIsUsingAI(false);

            // Try to get from cache first
            if (!forceRefresh) {
                const cached = await getCachedPredictions(userId);
                if (cached) {
                    // Use cached AI predictions
                    setAiResponse(cached.ai);
                    setPredictions(cached.legacy);
                    setIsUsingAI(true);
                    isLoadingRef.current = false;
                    return;
                }
            }

            // Cache miss or forced refresh - fetch from backend (in background)
            setLoading(true);

            // Fetch AI predictions asynchronously
            const aiData = await fetchAIPredictions();

            if (aiData) {
                // Convert to legacy format
                const legacyFormat = convertAIToLegacyFormat(aiData, staticPredictions);

                // Save to cache
                await savePredictionsToCache(aiData, legacyFormat, userId);

                // Update state
                setAiResponse(aiData);
                setPredictions(legacyFormat);
                setIsUsingAI(true);
            } else {
                // AI failed, stick with static
                console.log('[AI Predictions] Falling back to static predictions');
                setIsUsingAI(false);
            }
        } catch (error) {
            console.error('[AI Predictions] Error loading predictions:', error);
            setIsUsingAI(false);
        } finally {
            setLoading(false);
            isLoadingRef.current = false;
        }
    }, [userId, staticPredictions]);

    /**
     * Refresh predictions (force fetch from backend)
     */
    const refreshPredictions = useCallback(async () => {
        console.log('[AI Predictions] Manual refresh triggered');
        await loadPredictions(true);
    }, [loadPredictions]);

    /**
     * Initial load when component mounts or user changes
     */
    useEffect(() => {
        if (userId && loadedUserRef.current !== userId) {
            loadedUserRef.current = userId;
            loadPredictions(false);
        }
    }, [userId, loadPredictions]);

    /**
     * Update static predictions when data changes
     */
    useEffect(() => {
        // Recalculate static predictions whenever periods/settings change
        const newStatic = calculatePredictions(periods, settings);

        // If we're not using AI, update immediately
        if (!isUsingAI) {
            setPredictions(newStatic);
        }
    }, [periods, settings, isUsingAI]);

    return {
        predictions,
        aiResponse,
        loading,
        isUsingAI,
        refresh: refreshPredictions,
    };
}
