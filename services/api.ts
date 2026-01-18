/**
 * KanDu API Service
 *
 * This service provides a secure interface to all backend functionality
 * through Supabase Edge Functions. All API keys are kept server-side.
 *
 * SECURITY: This replaces direct API calls to Gemini/Google Places
 * that previously exposed API keys in the client.
 */

import { supabase } from './supabase';

// Types
export interface DiagnosisRequest {
  category: string;
  description: string;
  imageBase64?: string;
  videoBase64?: string;
}

export interface FreeDiagnosis {
  detectedItem?: {
    label: string;
    confidence: 'high' | 'medium' | 'low';
  };
  diagnosis: {
    summary: string;
    likelyCauses: string[];
  };
  triage: {
    riskLevel: 'low' | 'medium' | 'high';
    urgency: 'immediate' | 'soon' | 'can_wait';
    isDIYable: boolean;
  };
  youtubeVideos: Array<{
    title: string;
    searchQuery: string;
    relevance: string;
  }>;
  safetyWarnings: string[];
  nextSteps: string[];
  _meta?: {
    remaining: number;
    resetAt: string;
  };
}

export interface AdvancedDiagnosis {
  diagnosis: {
    summary: string;
    likelyCauses: string[];
    detailedAnalysis: string;
    productIdentification?: {
      brand: string;
      model: string;
      confidence: 'high' | 'medium' | 'low';
      alternativeMatches?: string[];
    };
  };
  triage: {
    riskLevel: 'low' | 'medium' | 'high';
    urgency: 'immediate' | 'soon' | 'can_wait';
    isDIYable: boolean;
  };
  stepByStep: string[];
  partsList: Array<{
    name: string;
    searchTerms: string;
    estimatedCost: string;
    partNumber?: string;
    whereToBuy?: string;
  }>;
  toolsList: Array<{
    name: string;
    searchTerms: string;
    estimatedCost?: string;
    required: boolean;
  }>;
  safetyWarnings: string[];
  detailedSafety: string[];
  troubleshooting: string[];
  youtubeVideos: Array<{
    title: string;
    searchQuery: string;
    relevance: string;
  }>;
  _meta?: {
    remaining: number;
    resetAt: string;
    model: string;
  };
}

export interface LocalPro {
  placeId: string;
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
  openNow?: boolean;
  phone?: string;
  website?: string;
  mapsUrl?: string;
}

export interface LocalProsRequest {
  category: string;
  queryText: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}

export interface GuidanceRequest {
  imageBase64: string;
  category: string;
  problemDescription: string;
  currentStep: number;
  totalSteps: number;
  currentStepInstruction: string;
  stepContext?: string;
  expectedItem?: string;
  originalImageBase64?: string;
  completionCriteria?: string; // How AI knows step is done
  visualAnchors?: string[]; // Key visual elements to look for
  userConstraints?: string; // User's tool/material constraints from voice questions
  bannedItems?: string[]; // Items user marked as unavailable - NEVER mention these
  confirmedSubstitutes?: Record<string, string>; // Map of original item -> substitute item (e.g., "aluminum foil" -> "wax paper")
}

export interface BoundingBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuidanceResponse {
  instruction: string;
  detectedObject?: string;
  confidence: number;
  stepComplete: boolean;
  suggestCompletion?: boolean; // AI thinks step might be complete, wants user confirmation
  completionEvidence?: string; // What visual evidence indicates completion
  safetyWarning?: string;
  shouldStop?: boolean;
  wrongItem?: boolean;
  detectedItemMismatch?: string;
  requiresManualAction?: boolean; // TRUE when user needs hands-free time for physical action
  highlights?: BoundingBox[];
  _meta?: {
    remaining: number;
  };
}

export interface RepairStep {
  stepNumber: number;
  instruction: string;
  safetyNote?: string;
  lookingFor: string;
  completionCriteria?: string; // How AI knows this step is done
  visualAnchors?: string[]; // Key visual elements to look for
  toolsNeeded?: string[]; // Tools required for this step
  materialsNeeded?: string[]; // Materials/parts required for this step
}

export interface RepairPlanRequest {
  category: string;
  diagnosisSummary: string;
  likelyCause?: string;
  bannedItems?: string[]; // Items user marked as unavailable - plan without these
  confirmedSubstitutes?: Record<string, string>; // Map of original item -> substitute item (e.g., "aluminum foil" -> "wax paper")
}

export interface VoiceQuestionRequest {
  question: string;
  category: string;
  diagnosisSummary: string;
  currentStepInstruction: string;
  identityStatus: 'CONFIRMED' | 'MISMATCH' | 'CHECKING' | 'UNKNOWN';
  imageBase64?: string;
  conversationContext?: string; // Recent Q&A history
  userConstraints?: string; // User's tool/material constraints
}

export interface VoiceQuestionResponse {
  answer: string;
  _meta?: {
    remaining: number;
  };
}

export interface FindSubstituteRequest {
  imageBase64: string;
  missingItem: string;
  category: string;
  stepInstruction: string;
  bannedItems?: string[];
}

export interface FindSubstituteResponse {
  foundSubstitute: boolean;
  suggestedSubstitute?: string;
  reason: string;
  confidence: number;
  instruction: string;
  otherOptions?: string[];
  highlight?: BoundingBox;
  _meta?: {
    remaining: number;
  };
}

export interface PaymentRequest {
  productType: 'advanced_diagnosis' | 'expert_session_15' | 'expert_session_30';
  metadata?: Record<string, string>;
}

export interface PaymentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface ApiError {
  error: string;
  remaining?: number;
  resetAt?: string;
}

// API Response wrapper
interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Call a Supabase Edge Function
 */
async function callFunction<T>(
  functionName: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    console.log(`[API] Calling ${functionName}...`);

    // Check if user is authenticated - try to refresh if needed
    let { data: { session } } = await supabase.auth.getSession();

    // If session exists but might be expired, try to refresh it
    if (session) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      const isExpired = expiresAt <= now;
      const expiresWithin5Min = expiresAt - now < fiveMinutes;

      console.log(`[API] Token check: expiresAt=${new Date(expiresAt).toISOString()}, now=${new Date(now).toISOString()}, expired=${isExpired}, expiresWithin5Min=${expiresWithin5Min}`);

      // Refresh if already expired or expires within 5 minutes
      if (isExpired || expiresWithin5Min) {
        console.log(`[API] Session ${isExpired ? 'EXPIRED' : 'expiring soon'}, refreshing...`);
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error(`[API] Session refresh failed:`, refreshError);
          // If refresh fails and token is expired, return auth error
          if (isExpired) {
            return { data: null, error: 'Session expired. Please sign in again.' };
          }
        } else if (refreshData.session) {
          session = refreshData.session;
          console.log(`[API] Session refreshed successfully, new expires_at: ${refreshData.session.expires_at}`);
        }
      }
    }

    console.log(`[API] Auth status: ${session ? 'authenticated' : 'NOT authenticated'}`);

    if (!session) {
      console.error(`[API] No session - user not logged in`);
      return { data: null, error: 'Authentication required. Please sign in.' };
    }

    // Log token info for debugging (first 20 chars only)
    const token = session.access_token;
    console.log(`[API] Token present: ${!!token}, starts with: ${token?.substring(0, 20)}...`);
    console.log(`[API] Token expires_at: ${session.expires_at}, now: ${Math.floor(Date.now()/1000)}`);

    // Explicitly pass auth header to ensure it's included
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(`[API] ${functionName} response:`, {
      data: data ? 'received' : null,
      dataType: typeof data,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'N/A',
      error
    });

    // Log actual data for debugging (truncated)
    if (data) {
      const dataStr = JSON.stringify(data);
      console.log(`[API] ${functionName} actual data (first 500 chars):`, dataStr.substring(0, 500));
    }

    if (error) {
      console.error(`[API] ${functionName} error:`, error);
      console.error(`[API] Error details:`, JSON.stringify(error, null, 2));

      // Log all error properties for debugging
      console.error(`[API] Error name:`, error.name);
      console.error(`[API] Error message:`, error.message);
      console.error(`[API] Error context:`, (error as any).context);
      console.error(`[API] Error status:`, (error as any).status);

      // Handle specific error codes
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        return { data: null, error: 'Session expired. Please sign in again.' };
      }

      // Check for context with more details
      const context = (error as any).context;
      if (context) {
        console.error(`[API] Context body:`, context.body);
        console.error(`[API] Context status:`, context.status);
      }

      // For debugging, return the actual error message with context
      let errorMsg = error.message || 'Unknown server error';

      // Try to extract error from context body
      if (context?.body) {
        try {
          const bodyError = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
          if (bodyError.error) {
            errorMsg = bodyError.error;
          }
        } catch (e) {
          // Body is not JSON, use as-is
          if (typeof context.body === 'string') {
            errorMsg = context.body;
          }
        }
      }

      // Also check if there's data with an error (some Supabase versions put it there)
      if (data && typeof data === 'object' && 'error' in data) {
        errorMsg = (data as any).error;
      }

      // Add status code to help diagnose
      const status = (error as any).status || context?.status;
      if (status && errorMsg === error.message) {
        errorMsg = `${errorMsg} (status: ${status})`;
      }

      return { data: null, error: errorMsg };
    }

    // Check if response contains an error field
    if (data && typeof data === 'object' && 'error' in data) {
      const apiError = data as unknown as ApiError;
      console.error(`[API] ${functionName} returned error:`, apiError.error);
      return { data: null, error: apiError.error };
    }

    console.log(`[API] ${functionName} success`);
    return { data, error: null };
  } catch (err) {
    console.error(`[API] ${functionName} exception:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}

// ============================================
// DIAGNOSIS API
// ============================================

/**
 * Get a free diagnosis using AI
 */
export async function getFreeDiagnosis(
  request: DiagnosisRequest
): Promise<ApiResult<FreeDiagnosis>> {
  // Log payload sizes for debugging
  const imageSize = request.imageBase64?.length || 0;
  const videoSize = request.videoBase64?.length || 0;
  console.log(`[API] getFreeDiagnosis payload sizes - image: ${(imageSize / 1024 / 1024).toFixed(2)}MB, video: ${(videoSize / 1024 / 1024).toFixed(2)}MB`);

  return callFunction<FreeDiagnosis>('diagnose', request);
}

/**
 * Get an advanced diagnosis (paid feature)
 */
export async function getAdvancedDiagnosis(
  request: DiagnosisRequest & { paymentIntentId?: string }
): Promise<ApiResult<AdvancedDiagnosis>> {
  return callFunction<AdvancedDiagnosis>('diagnose-advanced', request);
}

// ============================================
// LOCAL PROS API
// ============================================

/**
 * Search for local service providers
 * Uses direct fetch for better error handling
 */
export async function getLocalPros(
  request: LocalProsRequest
): Promise<ApiResult<{ pros: LocalPro[]; _meta: { remaining: number; resetAt: string } }>> {
  try {
    console.log(`[API] Calling local-pros...`);

    // Check if user is authenticated - try to refresh if needed
    let { data: { session } } = await supabase.auth.getSession();

    // If session exists but might be expired, try to refresh it
    if (session) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (expiresAt - now < fiveMinutes) {
        console.log(`[API] local-pros: Session expiring soon, refreshing...`);
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error(`[API] Session refresh failed:`, refreshError);
        } else if (refreshData.session) {
          session = refreshData.session;
          console.log(`[API] Session refreshed successfully`);
        }
      }
    }

    console.log(`[API] Auth status: ${session ? 'authenticated' : 'NOT authenticated'}`);

    if (!session) {
      return { data: null, error: 'Authentication required. Please sign in.' };
    }

    // Get Supabase URL from client
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fxqhpcmxektbinpizpmw.supabase.co';
    const functionUrl = `${supabaseUrl}/functions/v1/local-pros`;

    console.log(`[API] Fetching: ${functionUrl}`);

    // Use direct fetch for better error handling
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(request),
    });

    console.log(`[API] local-pros response status: ${response.status}`);

    // Parse response body
    const responseText = await response.text();
    console.log(`[API] local-pros response body (first 500 chars): ${responseText.substring(0, 500)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`[API] Failed to parse response as JSON:`, responseText);
      return { data: null, error: `Invalid response: ${responseText.substring(0, 200)}` };
    }

    if (!response.ok) {
      const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[API] local-pros error:`, errorMsg);
      return { data: null, error: errorMsg };
    }

    // Check if response contains an error field
    if (data && typeof data === 'object' && 'error' in data) {
      console.error(`[API] local-pros returned error:`, data.error);
      return { data: null, error: data.error };
    }

    console.log(`[API] local-pros success, found ${data?.pros?.length || 0} pros`);
    return { data, error: null };
  } catch (err) {
    console.error(`[API] local-pros exception:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}

// ============================================
// GUIDED FIX API
// ============================================

/**
 * Get real-time guidance for a repair step
 */
export async function getRealTimeGuidance(
  request: GuidanceRequest
): Promise<ApiResult<GuidanceResponse>> {
  return callFunction<GuidanceResponse>('guided-fix', request);
}

/**
 * Generate a repair plan from a diagnosis
 */
export async function generateRepairPlan(
  request: RepairPlanRequest
): Promise<ApiResult<{ steps: RepairStep[]; _meta: { remaining: number; resetAt: string } }>> {
  return callFunction('repair-plan', request);
}

/**
 * Ask a voice question during guided repair
 */
export async function askVoiceQuestion(
  request: VoiceQuestionRequest
): Promise<ApiResult<VoiceQuestionResponse>> {
  return callFunction<VoiceQuestionResponse>('voice-question', request);
}

/**
 * Find a substitute item by analyzing camera frame
 * Used when user marks an item as unavailable and wants help finding alternatives
 */
export async function findSubstitute(
  request: FindSubstituteRequest
): Promise<ApiResult<FindSubstituteResponse>> {
  return callFunction<FindSubstituteResponse>('find-substitute', request);
}

// ============================================
// PAYMENTS API
// ============================================

/**
 * Create a payment intent for purchasing features
 */
export async function createPayment(
  request: PaymentRequest
): Promise<ApiResult<PaymentResponse>> {
  return callFunction<PaymentResponse>('create-payment', request);
}

// ============================================
// USAGE API
// ============================================

/**
 * Get current usage stats for rate limiting display
 */
export async function getUsageStats(): Promise<ApiResult<Record<string, { count: number; limit: number }>>> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Get usage counts from the database
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const { data: usage, error } = await supabase
    .from('api_usage')
    .select('endpoint, created_at')
    .eq('user_id', user.id)
    .gte('created_at', dayAgo.toISOString());

  if (error) {
    return { data: null, error: error.message };
  }

  // Count usage per endpoint
  const limits: Record<string, { count: number; limit: number }> = {
    free_diagnosis: { count: 0, limit: 10 },
    advanced_diagnosis: { count: 0, limit: 20 },
    guided_fix: { count: 0, limit: 100 },
    repair_plan: { count: 0, limit: 20 },
    local_pros: { count: 0, limit: 50 },
  };

  for (const record of usage || []) {
    const endpoint = record.endpoint;
    if (endpoint in limits) {
      // guided_fix uses hourly limit, others use daily
      if (endpoint === 'guided_fix') {
        if (new Date(record.created_at) >= hourAgo) {
          limits[endpoint].count++;
        }
      } else {
        limits[endpoint].count++;
      }
    }
  }

  return { data: limits, error: null };
}

// ============================================
// CREDITS API
// ============================================

/**
 * Get user's available credits
 */
export async function getUserCredits(): Promise<ApiResult<Record<string, number>>> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { data: credits, error } = await supabase
    .from('user_credits')
    .select('credit_type, amount')
    .eq('user_id', user.id);

  if (error) {
    return { data: null, error: error.message };
  }

  const creditMap: Record<string, number> = {};
  for (const credit of credits || []) {
    creditMap[credit.credit_type] = credit.amount;
  }

  return { data: creditMap, error: null };
}
