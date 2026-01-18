/**
 * Rate Limiting utilities for Edge Functions
 * Uses Supabase database to track usage per user
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

export interface RateLimitConfig {
  // Maximum requests per time window
  maxRequests: number;
  // Time window in seconds (e.g., 86400 for 24 hours)
  windowSeconds: number;
  // Identifier for this rate limit type (e.g., 'free_diagnosis', 'advanced_diagnosis')
  limitType: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  currentCount: number;
}

// Default rate limits
export const RATE_LIMITS = {
  FREE_DIAGNOSIS: {
    maxRequests: 10,      // 10 free diagnoses per day
    windowSeconds: 86400, // 24 hours
    limitType: 'free_diagnosis',
  },
  ADVANCED_DIAGNOSIS: {
    maxRequests: 20,      // 20 advanced diagnoses per day (paid, so more generous)
    windowSeconds: 86400,
    limitType: 'advanced_diagnosis',
  },
  GUIDED_FIX: {
    maxRequests: 100,     // 100 guidance frames per hour (real-time, needs high limit)
    windowSeconds: 3600,
    limitType: 'guided_fix',
  },
  REPAIR_PLAN: {
    maxRequests: 20,      // 20 repair plans per day
    windowSeconds: 86400,
    limitType: 'repair_plan',
  },
  LOCAL_PROS: {
    maxRequests: 500,     // 500 local pro searches per day (generous for testing)
    windowSeconds: 86400,
    limitType: 'local_pros',
  },
} as const;

/**
 * Check if a user is within their rate limit
 * Uses the api_usage table to track requests
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - config.windowSeconds * 1000);
  const resetAt = new Date(Date.now() + config.windowSeconds * 1000);

  try {
    // Count requests in the current window
    const { count, error } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', config.limitType)
      .gte('created_at', windowStart.toISOString());

    if (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request but log it
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt,
        currentCount: 0,
      };
    }

    const currentCount = count || 0;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const allowed = currentCount < config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt,
      currentCount,
    };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    // On error, allow the request
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt,
      currentCount: 0,
    };
  }
}

/**
 * Record an API usage event
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_usage')
      .insert({
        user_id: userId,
        endpoint,
        metadata: metadata || {},
      });

    if (error) {
      console.error('Failed to record usage:', error);
    }
  } catch (err) {
    console.error('Usage recording failed:', err);
  }
}

/**
 * Get usage stats for a user
 */
export async function getUserUsageStats(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, { count: number; limit: number }>> {
  const stats: Record<string, { count: number; limit: number }> = {};

  for (const [key, config] of Object.entries(RATE_LIMITS)) {
    const result = await checkRateLimit(supabase, userId, config);
    stats[config.limitType] = {
      count: result.currentCount,
      limit: config.maxRequests,
    };
  }

  return stats;
}
