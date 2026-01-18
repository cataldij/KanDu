/**
 * Guided Fix Service
 *
 * SECURITY UPDATE: This module now uses Supabase Edge Functions
 * instead of calling Gemini directly. API keys are kept server-side.
 */

import * as api from './api';

// Re-export types for backwards compatibility
export type {
  GuidanceRequest,
  GuidanceResponse,
  BoundingBox,
  RepairStep,
} from './api';

// Legacy type alias for backwards compatibility
export type RepairPlanRequest = api.RepairPlanRequest;

/**
 * Get real-time guidance from AI based on camera frame
 * Uses Gemini 2.5 Flash for fast, cheap responses via Edge Function
 *
 * @param request - The guidance request with current camera frame and step info
 * @returns GuidanceResponse with instructions and visual highlights
 * @throws Error if the request fails
 */
export async function getRealTimeGuidance(
  request: api.GuidanceRequest
): Promise<api.GuidanceResponse> {
  const { data, error } = await api.getRealTimeGuidance(request);

  if (error) {
    console.error('Real-time guidance error:', error);

    if (error.includes('Rate limit') || error.includes('limit reached')) {
      throw new Error('Guidance limit reached. Please wait a moment before continuing.');
    }
    if (error.includes('Unauthorized') || error.includes('Authentication')) {
      throw new Error('Please sign in to use the guided fix feature.');
    }

    throw new Error('Failed to analyze frame. Please try again.');
  }

  if (!data) {
    throw new Error('No guidance received. Please try again.');
  }

  return data;
}

/**
 * Generate step-by-step repair plan from diagnosis
 *
 * @param category - The repair category
 * @param diagnosisSummary - Summary of the diagnosis
 * @param likelyCause - Optional likely cause of the problem
 * @param bannedItems - Optional list of items to exclude from the plan
 * @param confirmedSubstitutes - Optional map of original item -> substitute item
 * @returns Array of RepairStep objects
 * @throws Error if the request fails
 */
export async function generateRepairPlan(
  category: string,
  diagnosisSummary: string,
  likelyCause?: string,
  bannedItems?: string[],
  confirmedSubstitutes?: Record<string, string>
): Promise<api.RepairStep[]> {
  console.log('[guidedFix] generateRepairPlan called with:', { category, diagnosisSummary: diagnosisSummary?.substring(0, 100), likelyCause, bannedItems, confirmedSubstitutes });

  const { data, error } = await api.generateRepairPlan({
    category,
    diagnosisSummary,
    likelyCause,
    bannedItems,
    confirmedSubstitutes,
  });

  console.log('[guidedFix] API response:', { data: data ? 'received' : null, error });

  if (error) {
    console.error('[guidedFix] Repair plan error (full):', error);

    if (error.includes('Rate limit') || error.includes('limit reached')) {
      throw new Error('Daily repair plan limit reached. Please try again tomorrow.');
    }
    if (error.includes('Unauthorized') || error.includes('Authentication')) {
      throw new Error('Please sign in to generate a repair plan.');
    }

    // Include actual error in message for debugging
    throw new Error(`Repair plan failed: ${error}`);
  }

  if (!data?.steps) {
    throw new Error('No repair plan received. Please try again.');
  }

  return data.steps;
}

/**
 * Get remaining guided fix quota for the current user
 */
export async function getGuidedFixQuota(): Promise<{
  guidance: { used: number; limit: number };
  repairPlan: { used: number; limit: number };
}> {
  const { data, error } = await api.getUsageStats();

  if (error || !data) {
    // Return defaults if we can't fetch quota
    return {
      guidance: { used: 0, limit: 100 },
      repairPlan: { used: 0, limit: 20 },
    };
  }

  return {
    guidance: {
      used: data.guided_fix?.count || 0,
      limit: data.guided_fix?.limit || 100,
    },
    repairPlan: {
      used: data.repair_plan?.count || 0,
      limit: data.repair_plan?.limit || 20,
    },
  };
}
