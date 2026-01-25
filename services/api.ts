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
  body: object
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

// ============================================
// ARTICLE IMAGES API
// ============================================

export interface ArticleImage {
  title: string;
  searchTerm: string;
  thumbnailUrl: string;
  fullUrl: string;
}

/**
 * Get optimized images for article titles using Gemini + Unsplash
 */
export async function getArticleImages(
  titles: string[]
): Promise<ApiResult<{ images: ArticleImage[] }>> {
  return callFunction<{ images: ArticleImage[] }>('article-images', { titles });
}

// ============================================
// GUEST MODE API
// ============================================

export interface HomeBaseImage {
  url: string;
  angle: 'front' | 'right' | 'back' | 'left' | 'exit';
  description?: string;
}

export interface GuestKit {
  id: string;
  user_id: string;
  slug: string;
  kit_type: 'home' | 'rental';
  display_name: string;
  expires_at?: string;
  is_active: boolean;
  access_pin?: string;
  homeowner_name?: string;
  homeowner_phone?: string;
  show_phone_to_guest: boolean;
  home_base_image_url?: string; // Legacy single image
  home_base_images?: HomeBaseImage[]; // Multi-angle kitchen scan
  home_base_scan_complete?: boolean;
  home_base_description?: string;
  wifi_network?: string;
  wifi_password?: string;
  address?: string;
  show_address: boolean;
  checkin_time?: string;
  checkout_time?: string;
  checkin_instructions?: string;
  checkout_instructions?: string;
  house_rules?: string;
  created_at: string;
  updated_at: string;
}

export interface GuestKitItem {
  id: string;
  kit_id: string;
  zone_id?: string; // Reference to zone for shared pathways
  item_type: string;
  custom_name?: string;
  hint?: string;
  overview_image_url?: string;
  destination_image_url: string;
  control_image_url?: string;
  instructions?: string;
  warning_text?: string;
  route_description?: string;
  priority: 'critical' | 'important' | 'helpful';
  category: 'safety' | 'utilities' | 'appliances' | 'info';
  display_order: number;
  icon_name?: string;
  created_at: string;
  updated_at: string;
}

// Zone image for 360° scan of a zone
export interface ZoneImage {
  url: string;
  angle: 'front' | 'right' | 'back' | 'left';
  description?: string;
}

// Pathway waypoint image
export interface PathwayImage {
  url: string;
  sequence: number;
  label: string; // "hallway", "top of stairs", "basement door"
  description?: string;
}

// Zone types for quick selection
export type ZoneType = 'basement' | 'garage' | 'utility_room' | 'laundry' | 'bedroom' | 'bathroom' | 'outdoor' | 'attic' | 'custom';

export interface GuestKitZone {
  id: string;
  kit_id: string;
  name: string;
  zone_type: ZoneType;
  icon_name?: string;

  // Zone 360° scan
  zone_images: ZoneImage[];
  zone_scan_complete: boolean;
  zone_description?: string;

  // Pathway from kitchen to zone
  pathway_images: PathwayImage[];
  pathway_complete: boolean;
  pathway_description?: string;

  display_order: number;
  created_at: string;
  updated_at: string;
}

// Zone type definitions with icons
export interface ZoneTypeDefinition {
  name: string;
  icon: string;
  description: string;
}

export const ZONE_TYPES: Record<ZoneType, ZoneTypeDefinition> = {
  basement: { name: 'Basement', icon: 'layers', description: 'Underground level' },
  garage: { name: 'Garage', icon: 'car', description: 'Vehicle/storage area' },
  utility_room: { name: 'Utility Room', icon: 'construct', description: 'HVAC, water heater' },
  laundry: { name: 'Laundry Room', icon: 'shirt', description: 'Washer/dryer area' },
  bedroom: { name: 'Bedroom', icon: 'bed', description: 'Bedroom area' },
  bathroom: { name: 'Bathroom', icon: 'water', description: 'Bathroom area' },
  outdoor: { name: 'Outdoor', icon: 'leaf', description: 'Yard, pool, shed' },
  attic: { name: 'Attic', icon: 'home', description: 'Upper storage area' },
  custom: { name: 'Custom', icon: 'location', description: 'Other area' },
};

export interface GuestKitItemType {
  name: string;
  icon: string;
  priority: 'critical' | 'important' | 'helpful';
  category: 'safety' | 'utilities' | 'appliances' | 'info';
}

export interface NavigationResponse {
  location_identified: string;
  confidence: number;
  next_instruction: string;
  highlight?: {
    description: string;
    region?: { x: number; y: number; width: number; height: number };
  };
  warning?: string;
  arrived: boolean;
  step_number: number;
  total_steps: number;
}

/**
 * Create a new guest kit
 */
export async function createGuestKit(
  kit: Partial<GuestKit>
): Promise<ApiResult<{ kit: GuestKit; itemTypes: Record<string, GuestKitItemType> }>> {
  return callFunction('guest-kit', { action: 'create', kit });
}

/**
 * Update a guest kit
 */
export async function updateGuestKit(
  kitId: string,
  updates: Partial<GuestKit>
): Promise<ApiResult<{ kit: GuestKit }>> {
  return callFunction('guest-kit', { action: 'update', kitId, updates });
}

/**
 * Delete a guest kit
 */
export async function deleteGuestKit(
  kitId: string
): Promise<ApiResult<{ deleted: boolean }>> {
  return callFunction('guest-kit', { action: 'delete', kitId });
}

/**
 * Get a single guest kit with items
 */
export async function getGuestKit(
  kitId: string
): Promise<ApiResult<{ kit: GuestKit; items: GuestKitItem[]; itemTypes: Record<string, GuestKitItemType> }>> {
  return callFunction('guest-kit', { action: 'get', kitId });
}

/**
 * List all guest kits for the current user
 */
export async function listGuestKits(): Promise<ApiResult<{ kits: GuestKit[]; itemTypes: Record<string, GuestKitItemType> }>> {
  return callFunction('guest-kit', { action: 'list' });
}

/**
 * Add an item to a guest kit
 */
export async function addGuestKitItem(
  item: Partial<GuestKitItem>
): Promise<ApiResult<{ item: GuestKitItem }>> {
  return callFunction('guest-kit', { action: 'add-item', item });
}

/**
 * Update a guest kit item
 */
export async function updateGuestKitItem(
  itemId: string,
  updates: Partial<GuestKitItem>
): Promise<ApiResult<{ item: GuestKitItem }>> {
  return callFunction('guest-kit', { action: 'update-item', itemId, updates });
}

/**
 * Delete a guest kit item
 */
export async function deleteGuestKitItem(
  itemId: string
): Promise<ApiResult<{ deleted: boolean }>> {
  return callFunction('guest-kit', { action: 'delete-item', itemId });
}

/**
 * Get item type definitions
 */
export async function getGuestKitItemTypes(): Promise<ApiResult<{ itemTypes: Record<string, GuestKitItemType> }>> {
  return callFunction('guest-kit', { action: 'get-item-types' });
}

// ============================================
// GUEST KIT ZONES API
// ============================================

/**
 * Create a new zone for a guest kit
 */
export async function createGuestKitZone(
  zone: Partial<GuestKitZone>
): Promise<ApiResult<{ zone: GuestKitZone }>> {
  return callFunction('guest-kit', { action: 'create-zone', zone });
}

/**
 * Update a zone
 */
export async function updateGuestKitZone(
  zoneId: string,
  updates: Partial<GuestKitZone>
): Promise<ApiResult<{ zone: GuestKitZone }>> {
  return callFunction('guest-kit', { action: 'update-zone', zoneId, updates });
}

/**
 * Delete a zone
 */
export async function deleteGuestKitZone(
  zoneId: string
): Promise<ApiResult<{ deleted: boolean }>> {
  return callFunction('guest-kit', { action: 'delete-zone', zoneId });
}

/**
 * Get all zones for a guest kit
 */
export async function getGuestKitZones(
  kitId: string
): Promise<ApiResult<{ zones: GuestKitZone[] }>> {
  return callFunction('guest-kit', { action: 'list-zones', kitId });
}

/**
 * Get a single zone with its items
 */
export async function getGuestKitZone(
  zoneId: string
): Promise<ApiResult<{ zone: GuestKitZone; items: GuestKitItem[] }>> {
  return callFunction('guest-kit', { action: 'get-zone', zoneId });
}

// ============================================
// GUEST ACCESS API (Unauthenticated)
// ============================================

/**
 * Call guest access function (no auth required)
 */
async function callGuestFunction<T>(
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fxqhpcmxektbinpizpmw.supabase.co';
    const functionUrl = `${supabaseUrl}/functions/v1/guest-access`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error || `HTTP ${response.status}` };
    }

    if (data && typeof data === 'object' && 'error' in data) {
      return { data: null, error: data.error };
    }

    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}

/**
 * Get a guest kit by slug (for guests, no auth required)
 */
export async function getGuestKitBySlug(
  slug: string,
  pin?: string
): Promise<ApiResult<{
  kit?: GuestKit;
  items?: GuestKitItem[];
  requiresPin: boolean;
  kitName?: string;
}>> {
  return callGuestFunction({ action: 'get-kit', slug, pin });
}

/**
 * Verify PIN for a guest kit
 */
export async function verifyGuestKitPin(
  slug: string,
  pin: string
): Promise<ApiResult<{ verified: boolean }>> {
  return callGuestFunction({ action: 'verify-pin', slug, pin });
}

/**
 * Log item view for analytics
 */
export async function logGuestItemView(
  kitId: string,
  itemId: string
): Promise<ApiResult<{ logged: boolean }>> {
  return callGuestFunction({ action: 'log-view', kitId, itemId });
}

/**
 * AI-powered scan navigation for guests
 */
export async function scanNavigate(
  kitId: string,
  itemId: string,
  imageBase64: string,
  currentStep?: number
): Promise<ApiResult<{
  navigation: NavigationResponse;
  item: {
    name: string;
    instructions?: string;
    warning?: string;
    destination_image_url?: string;
    control_image_url?: string;
  };
}>> {
  return callGuestFunction({
    action: 'scan-navigate',
    kitId,
    itemId,
    imageBase64,
    currentStep,
  });
}

// ============================================
// INVENTORY & SHOPPING LIST TYPES
// ============================================

export type ScanType = 'refrigerator' | 'pantry' | 'toolbox' | 'garage' | 'other';
export type QuantityLevel = 'full' | 'good' | 'half' | 'low' | 'empty' | 'unknown';
export type ItemPriority = 'critical' | 'normal' | 'optional';

export interface InventoryItem {
  name: string;
  genericName?: string;       // Generic item type (e.g., 'ketchup', 'greek yogurt')
  brand?: string;             // Brand name (e.g., 'Heinz', 'Chobani')
  size?: string;              // Package size (e.g., '32 oz', '1 gallon')
  variety?: string;           // Variety/flavor (e.g., 'Honey Nut', '2% Reduced Fat')
  category: string;
  quantityLevel: QuantityLevel;
  quantityEstimate?: string;
  needsRestock: boolean;
  confidence: number;
  location?: string;
}

export interface ShoppingItem {
  itemName: string;
  searchTerms?: string;       // Optimized search query for online shopping
  genericAlternative?: string; // Generic version for budget shoppers
  brand?: string;             // Preferred brand based on detected products
  size?: string;              // Recommended size to purchase
  suggestedQuantity: string;
  category: string;
  priority: ItemPriority;
  reason?: string;
  storeSection?: string;
  estimatedPrice?: string;    // Price estimate (e.g., '$3-5')
}

export interface InventoryScanResult {
  success: boolean;
  scanType: ScanType;
  inventory: InventoryItem[];
  shoppingList: ShoppingItem[];
  summary: string;
  totalItemsDetected: number;
  itemsNeedingRestock: number;
  suggestions?: string[];
}

export interface ShoppingList {
  id: string;
  user_id: string;
  name: string;
  list_type: 'grocery' | 'hardware' | 'mixed';
  source_type?: string;
  source_id?: string;
  source_name?: string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  // Computed fields (calculated on fetch)
  item_count?: number;
  completed_count?: number;
}

export interface ShoppingListItem {
  id: string;
  list_id: string;
  item_name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  aisle_hint?: string;
  is_checked: boolean;
  checked_at?: string;
  estimated_price?: number;
  actual_price?: number;
  store_suggestion?: string;
  product_url?: string;
  source_step_number?: number;
  is_tool: boolean;
  priority: ItemPriority;
  notes?: string;
  substitute_for?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// INVENTORY SCAN FUNCTIONS
// ============================================

/**
 * Scan fridge/pantry/toolbox images to identify items and quantity levels
 * Supports single image (string) or multiple images (string[])
 */
export async function scanInventory(
  images: string | string[],
  scanType: ScanType = 'refrigerator',
  context?: string
): Promise<ApiResult<InventoryScanResult>> {
  // Support both single image (legacy) and array of images
  const imageArray = Array.isArray(images) ? images : [images];
  console.log('[scanInventory] Calling inventory-scan with', imageArray.length, 'image(s)');

  // Use callFunction for consistent auth handling with other endpoints
  return callFunction<InventoryScanResult>('inventory-scan', {
    images: imageArray,
    scanType,
    context,
  });
}

// ============================================
// SHOPPING LIST FUNCTIONS
// ============================================

/**
 * Get all shopping lists for the current user with item counts
 */
export async function getShoppingLists(
  includeArchived = false
): Promise<ApiResult<ShoppingList[]>> {
  try {
    // Fetch lists with item counts using a subquery
    let query = supabase
      .from('shopping_lists')
      .select(`
        *,
        shopping_list_items(id, is_checked)
      `)
      .order('created_at', { ascending: false });

    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    // Calculate item counts from the joined data
    const listsWithCounts: ShoppingList[] = (data || []).map((list: any) => {
      const items = list.shopping_list_items || [];
      return {
        ...list,
        item_count: items.length,
        completed_count: items.filter((item: any) => item.is_checked).length,
        shopping_list_items: undefined, // Remove the raw items data
      };
    });

    return { data: listsWithCounts, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a shopping list with its items
 */
export async function getShoppingListWithItems(
  listId: string
): Promise<ApiResult<{ list: ShoppingList; items: ShoppingListItem[] }>> {
  try {
    const [listResult, itemsResult] = await Promise.all([
      supabase.from('shopping_lists').select('*').eq('id', listId).single(),
      supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', listId)
        .order('is_checked', { ascending: true })
        .order('priority', { ascending: true })
        .order('display_order', { ascending: true }),
    ]);

    if (listResult.error) {
      return { data: null, error: listResult.error.message };
    }

    return {
      data: {
        list: listResult.data,
        items: itemsResult.data || [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create a new shopping list
 */
export async function createShoppingList(
  name: string,
  listType: 'grocery' | 'hardware' | 'mixed',
  sourceType?: string,
  sourceName?: string
): Promise<ApiResult<ShoppingList>> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) {
      return { data: null, error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        user_id: userData.user.id,
        name,
        list_type: listType,
        source_type: sourceType,
        source_name: sourceName,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Add item to shopping list
 */
export async function addShoppingListItem(
  listId: string,
  item: Partial<ShoppingListItem>
): Promise<ApiResult<ShoppingListItem>> {
  try {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        aisle_hint: item.aisle_hint,
        estimated_price: item.estimated_price,
        store_suggestion: item.store_suggestion,
        is_tool: item.is_tool || false,
        priority: item.priority || 'normal',
        notes: item.notes,
        source_step_number: item.source_step_number,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Add multiple items to shopping list
 */
export async function addShoppingListItems(
  listId: string,
  items: Array<Partial<ShoppingListItem>>
): Promise<ApiResult<ShoppingListItem[]>> {
  try {
    const insertData = items.map((item) => ({
      list_id: listId,
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      aisle_hint: item.aisle_hint,
      estimated_price: item.estimated_price,
      store_suggestion: item.store_suggestion,
      is_tool: item.is_tool || false,
      priority: item.priority || 'normal',
      notes: item.notes,
      source_step_number: item.source_step_number,
    }));

    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert(insertData)
      .select();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Toggle item checked status
 */
export async function toggleShoppingListItem(
  itemId: string,
  isChecked: boolean
): Promise<ApiResult<ShoppingListItem>> {
  try {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .update({
        is_checked: isChecked,
        checked_at: isChecked ? new Date().toISOString() : null,
      })
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete shopping list item
 */
export async function deleteShoppingListItem(
  itemId: string
): Promise<ApiResult<boolean>> {
  try {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Update a shopping list item (e.g., edit name, priority)
 */
export async function updateShoppingListItem(
  itemId: string,
  updates: { item_name?: string; priority?: ItemPriority; quantity?: string; notes?: string }
): Promise<ApiResult<ShoppingListItem>> {
  try {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Archive a shopping list
 */
export async function archiveShoppingList(
  listId: string
): Promise<ApiResult<boolean>> {
  try {
    const { error } = await supabase
      .from('shopping_lists')
      .update({ is_archived: true })
      .eq('id', listId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete a shopping list and all its items
 */
export async function deleteShoppingList(
  listId: string
): Promise<ApiResult<boolean>> {
  try {
    const { error } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', listId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create shopping list from repair plan steps (tools and materials)
 */
export async function createShoppingListFromRepairPlan(
  repairSteps: RepairStep[],
  category: string,
  diagnosisSummary: string
): Promise<ApiResult<{ list: ShoppingList; items: ShoppingListItem[] }>> {
  try {
    // Aggregate all tools and materials from all steps
    const toolsMap = new Map<string, { name: string; stepNumbers: number[] }>();
    const materialsMap = new Map<string, { name: string; stepNumbers: number[] }>();

    repairSteps.forEach((step) => {
      // Collect tools
      step.toolsNeeded?.forEach((tool) => {
        const normalizedName = tool.toLowerCase().trim();
        const existing = toolsMap.get(normalizedName);
        if (existing) {
          existing.stepNumbers.push(step.stepNumber);
        } else {
          toolsMap.set(normalizedName, { name: tool, stepNumbers: [step.stepNumber] });
        }
      });

      // Collect materials
      step.materialsNeeded?.forEach((material) => {
        const normalizedName = material.toLowerCase().trim();
        const existing = materialsMap.get(normalizedName);
        if (existing) {
          existing.stepNumbers.push(step.stepNumber);
        } else {
          materialsMap.set(normalizedName, { name: material, stepNumbers: [step.stepNumber] });
        }
      });
    });

    // If no items, return early
    if (toolsMap.size === 0 && materialsMap.size === 0) {
      return { data: null, error: 'No tools or materials needed for this repair' };
    }

    // Create the list
    const listResult = await createShoppingList(
      `${category} Repair - ${diagnosisSummary.substring(0, 30)}...`,
      'hardware',
      'guided_fix',
      diagnosisSummary
    );

    if (listResult.error || !listResult.data) {
      return { data: null, error: listResult.error || 'Failed to create list' };
    }

    // Create items array
    const items: Array<Partial<ShoppingListItem>> = [];

    // Add tools
    toolsMap.forEach(({ name, stepNumbers }) => {
      items.push({
        item_name: name,
        category: 'tools',
        is_tool: true,
        priority: 'normal',
        notes: `Needed for step${stepNumbers.length > 1 ? 's' : ''} ${stepNumbers.join(', ')}`,
        store_suggestion: 'Home Depot / Lowes',
      });
    });

    // Add materials
    materialsMap.forEach(({ name, stepNumbers }) => {
      items.push({
        item_name: name,
        category: 'hardware',
        is_tool: false,
        priority: 'normal',
        notes: `Needed for step${stepNumbers.length > 1 ? 's' : ''} ${stepNumbers.join(', ')}`,
        store_suggestion: 'Home Depot / Lowes',
      });
    });

    const itemsResult = await addShoppingListItems(listResult.data.id, items);

    if (itemsResult.error) {
      return { data: null, error: itemsResult.error };
    }

    return {
      data: {
        list: listResult.data,
        items: itemsResult.data || [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create shopping list from inventory scan results
 */
export async function createShoppingListFromScan(
  scanResult: InventoryScanResult,
  listName?: string
): Promise<ApiResult<{ list: ShoppingList; items: ShoppingListItem[] }>> {
  try {
    // Determine list type based on scan type
    const listType = scanResult.scanType === 'toolbox' || scanResult.scanType === 'garage'
      ? 'hardware'
      : 'grocery';

    // Create the list
    const listResult = await createShoppingList(
      listName || `${scanResult.scanType.charAt(0).toUpperCase() + scanResult.scanType.slice(1)} Shopping List`,
      listType,
      'fridge_scan',
      scanResult.summary
    );

    if (listResult.error || !listResult.data) {
      return { data: null, error: listResult.error || 'Failed to create list' };
    }

    // Add items from the scan
    const items = scanResult.shoppingList.map((item) => ({
      item_name: item.itemName,
      quantity: item.suggestedQuantity,
      category: item.category,
      aisle_hint: item.storeSection,
      priority: item.priority,
      notes: item.reason,
      is_tool: listType === 'hardware',
    }));

    const itemsResult = await addShoppingListItems(listResult.data.id, items);

    if (itemsResult.error) {
      return { data: null, error: itemsResult.error };
    }

    return {
      data: {
        list: listResult.data,
        items: itemsResult.data || [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// RECIPE TRACKING TYPES
// ============================================

export type RecipeCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'beverage' | 'other';

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category?: RecipeCategory;
  cuisine?: string;
  servings: number;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  source_type?: 'manual' | 'receipt_scan' | 'imported' | 'ai_suggested';
  source_url?: string;
  image_url?: string;
  times_cooked: number;
  last_cooked_at?: string;
  is_favorite: boolean;
  auto_replenish_enabled: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_name: string;
  generic_name?: string;
  brand_preference?: string;
  quantity?: number;
  unit?: string;
  quantity_text?: string;
  category?: string;
  is_optional: boolean;
  typical_package_size?: string;
  estimated_cost?: number;
  display_order: number;
  created_at: string;
}

export interface CookingHistory {
  id: string;
  user_id: string;
  recipe_id?: string;
  recipe_name: string;
  servings_made: number;
  cooked_at: string;
  generated_shopping_list_id?: string;
  auto_replenished: boolean;
  notes?: string;
  rating?: number;
  created_at: string;
}

// Recipe suggestion from AI
export interface RecipeSuggestion {
  name: string;
  emoji?: string;
  description?: string;
  prepTime: number; // minutes
  cookTime: number; // minutes
  difficulty: 'Easy' | 'Medium' | 'Hard';
  servings: number;
  cuisine?: string;
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
  }>;
  steps: Array<{
    stepNumber: number;
    instruction: string;
    duration?: number; // minutes
    tip?: string;
  }>;
}

// ============================================
// RECIPE SUGGESTION (AI-POWERED)
// ============================================

/**
 * Get AI-powered recipe suggestions based on user preferences
 */
export async function suggestRecipes(params: {
  mealType: string;
  servings: string;
  energy: string;
  mood?: string;
  cuisine?: string;
  specificDish?: string;
  surprise?: boolean;
}): Promise<ApiResult<RecipeSuggestion[]>> {
  try {
    const { data, error } = await supabase.functions.invoke('suggest-recipes', {
      body: params,
    });

    if (error) {
      console.error('[API] Recipe suggestion error:', error);
      return { data: null, error: error.message };
    }

    if (!data?.recipes || !Array.isArray(data.recipes)) {
      return { data: null, error: 'Invalid response from recipe suggestion' };
    }

    return { data: data.recipes, error: null };
  } catch (error) {
    console.error('[API] Recipe suggestion exception:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// RECIPE TRACKING FUNCTIONS
// ============================================

/**
 * Get all recipes for the current user
 */
export async function getRecipes(
  options?: { category?: RecipeCategory; favoritesOnly?: boolean }
): Promise<ApiResult<Recipe[]>> {
  try {
    let query = supabase
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(*)
      `)
      .order('last_cooked_at', { ascending: false, nullsFirst: false });

    if (options?.category) {
      query = query.eq('category', options.category);
    }

    if (options?.favoritesOnly) {
      query = query.eq('is_favorite', true);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single recipe with ingredients
 */
export async function getRecipe(recipeId: string): Promise<ApiResult<Recipe>> {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(*)
      `)
      .eq('id', recipeId)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create a new recipe
 */
export async function createRecipe(
  recipe: {
    name: string;
    description?: string;
    category?: RecipeCategory;
    cuisine?: string;
    servings?: number;
    prep_time_minutes?: number;
    cook_time_minutes?: number;
    image_url?: string;
  },
  ingredients: Array<{
    ingredient_name: string;
    quantity?: number;
    unit?: string;
    quantity_text?: string;
    category?: string;
    is_optional?: boolean;
  }>
): Promise<ApiResult<Recipe>> {
  try {
    // Create the recipe
    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        name: recipe.name,
        description: recipe.description,
        category: recipe.category || 'dinner',
        cuisine: recipe.cuisine,
        servings: recipe.servings || 4,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        image_url: recipe.image_url,
        source_type: 'manual',
      })
      .select()
      .single();

    if (recipeError || !recipeData) {
      return { data: null, error: recipeError?.message || 'Failed to create recipe' };
    }

    // Add ingredients
    if (ingredients.length > 0) {
      const ingredientData = ingredients.map((ing, index) => ({
        recipe_id: recipeData.id,
        ingredient_name: ing.ingredient_name,
        quantity: ing.quantity,
        unit: ing.unit,
        quantity_text: ing.quantity_text,
        category: ing.category,
        is_optional: ing.is_optional || false,
        display_order: index + 1,
      }));

      const { error: ingredientError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredientData);

      if (ingredientError) {
        console.warn('Failed to add ingredients:', ingredientError.message);
      }
    }

    // Fetch the complete recipe with ingredients
    return getRecipe(recipeData.id);
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Mark a recipe as cooked and optionally auto-replenish ingredients
 */
export async function cookRecipe(
  recipeId: string,
  options?: {
    servings?: number;
    notes?: string;
    rating?: number;
    autoReplenish?: boolean;
  }
): Promise<ApiResult<CookingHistory>> {
  try {
    // Use the database function for atomic operation
    const { data, error } = await supabase.rpc('cook_recipe', {
      p_recipe_id: recipeId,
      p_servings: options?.servings,
      p_notes: options?.notes,
      p_rating: options?.rating,
      p_auto_replenish: options?.autoReplenish ?? true,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    // Fetch the cooking history entry
    const { data: historyData, error: historyError } = await supabase
      .from('cooking_history')
      .select('*')
      .eq('id', data)
      .single();

    if (historyError) {
      return { data: null, error: historyError.message };
    }

    return { data: historyData, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get cooking history
 */
export async function getCookingHistory(
  options?: { limit?: number; recipeId?: string }
): Promise<ApiResult<CookingHistory[]>> {
  try {
    let query = supabase
      .from('cooking_history')
      .select('*')
      .order('cooked_at', { ascending: false });

    if (options?.recipeId) {
      query = query.eq('recipe_id', options.recipeId);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Toggle recipe favorite status
 */
export async function toggleRecipeFavorite(
  recipeId: string,
  isFavorite: boolean
): Promise<ApiResult<Recipe>> {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .update({ is_favorite: isFavorite })
      .eq('id', recipeId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete a recipe
 */
export async function deleteRecipe(recipeId: string): Promise<ApiResult<boolean>> {
  try {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipeId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
