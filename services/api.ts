/**
 * KanDu API Service
 *
 * This service provides a secure interface to all backend functionality
 * through Supabase Edge Functions. All API keys are kept server-side.
 *
 * SECURITY: This replaces direct API calls to Gemini/Google Places
 * that previously exposed API keys in the client.
 */

import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

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

    // Get current session - Supabase handles token refresh automatically
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[API] Auth status: ${session ? 'authenticated' : 'NOT authenticated'}`);

    if (!session) {
      console.error(`[API] No session - user not logged in`);
      return { data: null, error: 'Authentication required. Please sign in.' };
    }

    // Log token info for debugging (first 20 chars only)
    const token = session.access_token;
    console.log(`[API] Token present: ${!!token}, starts with: ${token?.substring(0, 20)}...`);
    console.log(`[API] Token expires_at: ${session.expires_at}, now: ${Math.floor(Date.now()/1000)}`);

    // Use fetch directly to have full control over headers
    // supabase.functions.invoke was not sending apikey correctly
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as T;
    const error = response.ok ? null : { message: (data as any)?.error || `HTTP ${response.status}` };

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
  // Direction for AR floor arrow
  move_direction?: 'forward' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'back' | 'arrived' | null;
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
  // Budget tracking (Phase 1 feature)
  budget?: number | null;
  currency?: string;
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
  barcode?: string; // Phase 3A: Barcode scanner support
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

// ============================================
// PRICE ESTIMATION
// ============================================

// Common grocery item prices (average US prices in 2024-2025)
const GROCERY_PRICES: Record<string, number> = {
  // Dairy
  'milk': 4.50, 'whole milk': 4.50, '2% milk': 4.50, 'skim milk': 4.25, 'oat milk': 5.50, 'almond milk': 4.99,
  'eggs': 4.99, 'dozen eggs': 4.99, 'butter': 5.49, 'cheese': 4.99, 'cheddar': 4.99, 'mozzarella': 4.99,
  'cream cheese': 3.99, 'sour cream': 2.99, 'yogurt': 1.29, 'greek yogurt': 1.49, 'cottage cheese': 4.29,
  'half and half': 4.49, 'heavy cream': 5.99, 'whipped cream': 4.29, 'cream': 4.99,

  // Bread & Bakery
  'bread': 3.99, 'white bread': 3.49, 'wheat bread': 4.29, 'sourdough': 5.49, 'bagels': 4.99,
  'tortillas': 3.99, 'pita': 3.49, 'english muffins': 3.99, 'croissants': 5.99, 'rolls': 3.99,
  'buns': 3.49, 'hamburger buns': 3.49, 'hot dog buns': 3.49,

  // Meat & Protein
  'chicken': 8.99, 'chicken breast': 9.99, 'chicken thighs': 6.99, 'ground beef': 7.99, 'beef': 12.99,
  'steak': 14.99, 'pork': 6.99, 'pork chops': 7.99, 'bacon': 7.99, 'sausage': 5.99, 'ham': 6.99,
  'turkey': 8.99, 'ground turkey': 7.99, 'fish': 9.99, 'salmon': 12.99, 'shrimp': 11.99, 'tuna': 2.49,
  'hot dogs': 4.99, 'deli meat': 7.99, 'lunch meat': 6.99,

  // Produce
  'apples': 4.99, 'bananas': 1.49, 'oranges': 4.99, 'lemons': 0.69, 'limes': 0.49, 'grapes': 4.99,
  'strawberries': 4.99, 'blueberries': 5.99, 'raspberries': 5.99, 'avocado': 1.99, 'avocados': 5.99,
  'tomatoes': 3.99, 'tomato': 0.99, 'onions': 2.99, 'onion': 0.99, 'potatoes': 4.99, 'potato': 0.79,
  'carrots': 2.49, 'celery': 2.99, 'lettuce': 2.99, 'spinach': 4.99, 'broccoli': 2.99, 'cucumber': 1.49,
  'peppers': 1.99, 'bell pepper': 1.49, 'garlic': 0.99, 'ginger': 2.99, 'mushrooms': 3.99,
  'corn': 0.79, 'green beans': 2.99, 'asparagus': 4.99, 'zucchini': 1.99, 'squash': 1.99,
  'cabbage': 2.49, 'kale': 3.99, 'cilantro': 1.49, 'parsley': 1.49, 'basil': 2.99,

  // Pantry Staples
  'rice': 4.99, 'pasta': 1.99, 'spaghetti': 1.99, 'noodles': 2.49, 'cereal': 4.99, 'oatmeal': 4.99,
  'flour': 4.49, 'sugar': 3.99, 'salt': 1.99, 'pepper': 4.99, 'olive oil': 9.99, 'vegetable oil': 4.99,
  'cooking oil': 4.99, 'vinegar': 3.49, 'soy sauce': 3.99, 'ketchup': 4.29, 'mustard': 2.99,
  'mayonnaise': 5.49, 'mayo': 5.49, 'peanut butter': 4.99, 'jelly': 3.99, 'jam': 4.49, 'honey': 7.99,
  'maple syrup': 9.99, 'coffee': 9.99, 'tea': 4.99, 'cocoa': 5.99, 'chocolate': 3.99,

  // Canned Goods
  'canned tomatoes': 1.99, 'tomato sauce': 1.49, 'tomato paste': 1.29, 'beans': 1.49, 'black beans': 1.49,
  'chickpeas': 1.49, 'corn': 1.29, 'peas': 1.29, 'soup': 2.99, 'broth': 2.99, 'chicken broth': 2.99,

  // Frozen
  'ice cream': 5.99, 'frozen pizza': 7.99, 'frozen vegetables': 3.49, 'frozen fruit': 4.99,
  'frozen chicken': 12.99, 'frozen fish': 9.99, 'frozen waffles': 4.49, 'frozen fries': 4.49,

  // Beverages
  'water': 5.99, 'bottled water': 5.99, 'juice': 4.99, 'orange juice': 5.99, 'apple juice': 4.49,
  'soda': 7.99, 'coke': 7.99, 'pepsi': 7.99, 'sprite': 7.99, 'beer': 12.99, 'wine': 12.99,
  'sparkling water': 5.99, 'energy drink': 2.99, 'sports drink': 2.49, 'gatorade': 2.49,

  // Snacks
  'chips': 4.99, 'crackers': 3.99, 'cookies': 4.49, 'pretzels': 3.99, 'popcorn': 4.99,
  'nuts': 7.99, 'almonds': 8.99, 'peanuts': 5.99, 'granola bars': 4.99, 'trail mix': 6.99,

  // Condiments & Spices
  'salsa': 4.49, 'hot sauce': 3.99, 'bbq sauce': 3.99, 'ranch': 4.49, 'italian dressing': 3.99,
  'cinnamon': 4.99, 'cumin': 4.99, 'paprika': 4.99, 'oregano': 3.99, 'thyme': 3.99,

  // Personal Care (common additions)
  'toilet paper': 12.99, 'paper towels': 9.99, 'tissues': 3.99, 'soap': 4.99, 'shampoo': 6.99,
  'toothpaste': 4.99, 'deodorant': 5.99, 'lotion': 7.99,

  // Cleaning
  'dish soap': 3.99, 'laundry detergent': 12.99, 'bleach': 4.99, 'trash bags': 9.99,
  'sponges': 3.99, 'cleaning spray': 4.99, 'disinfectant': 5.99,
};

// Hardware/tool prices
const HARDWARE_PRICES: Record<string, number> = {
  // Basic Tools
  'screwdriver': 8.99, 'hammer': 15.99, 'pliers': 12.99, 'wrench': 14.99, 'adjustable wrench': 16.99,
  'tape measure': 9.99, 'level': 19.99, 'drill': 79.99, 'drill bits': 19.99, 'saw': 24.99,
  'utility knife': 8.99, 'box cutter': 5.99, 'scissors': 7.99, 'wire cutters': 12.99,

  // Plumbing
  'plunger': 12.99, 'pipe wrench': 24.99, 'plumbers tape': 3.99, 'teflon tape': 3.99,
  'drain snake': 19.99, 'pvc pipe': 4.99, 'pipe fittings': 3.99, 'faucet': 79.99,
  'shutoff valve': 12.99, 'toilet flapper': 8.99, 'wax ring': 5.99,

  // Electrical
  'wire nuts': 4.99, 'electrical tape': 4.99, 'outlet': 3.99, 'switch': 4.99, 'light switch': 4.99,
  'circuit breaker': 12.99, 'wire': 19.99, 'extension cord': 14.99, 'power strip': 19.99,
  'light bulb': 5.99, 'led bulb': 7.99, 'batteries': 9.99, 'multimeter': 29.99,

  // Fasteners
  'screws': 6.99, 'nails': 5.99, 'bolts': 4.99, 'nuts': 3.99, 'washers': 3.99,
  'anchors': 5.99, 'wall anchors': 5.99, 'drywall screws': 7.99,

  // Adhesives & Sealants
  'glue': 4.99, 'wood glue': 6.99, 'super glue': 4.99, 'epoxy': 8.99, 'caulk': 6.99,
  'silicone': 7.99, 'sealant': 7.99, 'wd-40': 6.99, 'lubricant': 5.99,

  // Safety
  'safety glasses': 9.99, 'gloves': 12.99, 'work gloves': 14.99, 'dust mask': 9.99,
  'ear plugs': 5.99, 'hard hat': 19.99,

  // Paint & Finishing
  'paint': 34.99, 'primer': 24.99, 'paint brush': 8.99, 'roller': 9.99, 'paint roller': 12.99,
  'sandpaper': 6.99, 'wood stain': 14.99, 'polyurethane': 19.99, 'painters tape': 6.99,
  'drop cloth': 9.99,

  // Misc
  'flashlight': 14.99, 'ladder': 89.99, 'stud finder': 24.99, 'caulk gun': 9.99,
  'zip ties': 5.99, 'duct tape': 7.99, 'masking tape': 5.99,
};

// Category-based fallback prices
const CATEGORY_FALLBACK_PRICES: Record<string, number> = {
  'dairy': 4.50,
  'produce': 3.00,
  'meat': 9.00,
  'bakery': 4.00,
  'frozen': 5.00,
  'beverages': 5.00,
  'snacks': 4.50,
  'pantry': 4.00,
  'condiments': 4.00,
  'cleaning': 6.00,
  'personal care': 6.00,
  'tools': 15.00,
  'hardware': 10.00,
  'electrical': 8.00,
  'plumbing': 12.00,
  'other': 5.00,
};

/**
 * Estimate price for a shopping list item
 * Uses fuzzy matching against known item prices
 */
export function estimateItemPrice(itemName: string, category?: string, isHardware?: boolean): number | null {
  const normalizedName = itemName.toLowerCase().trim();
  const priceDb = isHardware ? HARDWARE_PRICES : GROCERY_PRICES;

  // 1. Exact match
  if (priceDb[normalizedName]) {
    return priceDb[normalizedName];
  }

  // 2. Partial match - check if item name contains or is contained by any key
  for (const [key, price] of Object.entries(priceDb)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return price;
    }
  }

  // 3. Word-by-word match - check individual words
  const words = normalizedName.split(/\s+/);
  for (const word of words) {
    if (word.length >= 3 && priceDb[word]) {
      return priceDb[word];
    }
  }

  // 4. Check hardware prices if not found in grocery (might be mixed list)
  if (!isHardware) {
    for (const [key, price] of Object.entries(HARDWARE_PRICES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return price;
      }
    }
  }

  // 5. Category-based fallback
  if (category) {
    const normalizedCategory = category.toLowerCase();
    if (CATEGORY_FALLBACK_PRICES[normalizedCategory]) {
      return CATEGORY_FALLBACK_PRICES[normalizedCategory];
    }
  }

  // 6. Default fallback based on list type
  return isHardware ? 10.00 : 4.00;
}

/**
 * Estimate category for an item based on its name
 */
export function estimateItemCategory(itemName: string): string {
  const normalizedName = itemName.toLowerCase();

  // Dairy
  if (/milk|cheese|yogurt|butter|cream|egg/.test(normalizedName)) return 'dairy';

  // Produce
  if (/apple|banana|orange|lemon|lime|grape|berry|avocado|tomato|onion|potato|carrot|lettuce|spinach|broccoli|pepper|garlic|mushroom|fruit|vegetable/.test(normalizedName)) return 'produce';

  // Meat
  if (/chicken|beef|pork|steak|bacon|sausage|ham|turkey|fish|salmon|shrimp|meat/.test(normalizedName)) return 'meat';

  // Bakery
  if (/bread|bagel|tortilla|roll|bun|croissant|muffin/.test(normalizedName)) return 'bakery';

  // Beverages
  if (/water|juice|soda|coke|pepsi|beer|wine|coffee|tea|drink/.test(normalizedName)) return 'beverages';

  // Frozen
  if (/frozen|ice cream/.test(normalizedName)) return 'frozen';

  // Snacks
  if (/chip|cracker|cookie|pretzel|popcorn|nut|granola|snack/.test(normalizedName)) return 'snacks';

  // Cleaning
  if (/soap|detergent|bleach|clean|sponge|trash bag/.test(normalizedName)) return 'cleaning';

  // Personal care
  if (/shampoo|toothpaste|deodorant|lotion|toilet paper|tissue|paper towel/.test(normalizedName)) return 'personal care';

  // Tools
  if (/screwdriver|hammer|pliers|wrench|drill|saw|knife|tape measure/.test(normalizedName)) return 'tools';

  // Hardware
  if (/screw|nail|bolt|anchor|wire|pipe|faucet|outlet|switch/.test(normalizedName)) return 'hardware';

  // Electrical
  if (/bulb|battery|cord|outlet|switch|breaker/.test(normalizedName)) return 'electrical';

  // Plumbing
  if (/plunger|pipe|drain|faucet|valve|toilet/.test(normalizedName)) return 'plumbing';

  // Pantry (default for food items)
  if (/rice|pasta|flour|sugar|oil|sauce|soup|can|cereal/.test(normalizedName)) return 'pantry';

  return 'other';
}

/**
 * Add item to shopping list with auto price estimation
 */
export async function addShoppingListItem(
  listId: string,
  item: Partial<ShoppingListItem>
): Promise<ApiResult<ShoppingListItem>> {
  try {
    // Auto-estimate category if not provided
    const category = item.category || (item.item_name ? estimateItemCategory(item.item_name) : undefined);

    // Auto-estimate price if not provided
    const estimatedPrice = item.estimated_price ??
      (item.item_name ? estimateItemPrice(item.item_name, category, item.is_tool) : null);

    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        category: category,
        aisle_hint: item.aisle_hint,
        estimated_price: estimatedPrice,
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
 * Add multiple items to shopping list with auto price estimation
 */
export async function addShoppingListItems(
  listId: string,
  items: Array<Partial<ShoppingListItem>>
): Promise<ApiResult<ShoppingListItem[]>> {
  try {
    const insertData = items.map((item) => {
      // Auto-estimate category if not provided
      const category = item.category || (item.item_name ? estimateItemCategory(item.item_name) : undefined);

      // Auto-estimate price if not provided
      const estimatedPrice = item.estimated_price ??
        (item.item_name ? estimateItemPrice(item.item_name, category, item.is_tool) : null);

      return {
        list_id: listId,
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        category: category,
        aisle_hint: item.aisle_hint,
        estimated_price: estimatedPrice,
        store_suggestion: item.store_suggestion,
        is_tool: item.is_tool || false,
        priority: item.priority || 'normal',
        notes: item.notes,
        source_step_number: item.source_step_number,
      };
    });

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
  updates: { item_name?: string; priority?: ItemPriority; quantity?: string; notes?: string; display_order?: number }
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

/**
 * Duplicate a shopping list with all its items (for "Shop Again" feature)
 */
export async function duplicateShoppingList(
  listId: string,
  newName?: string
): Promise<ApiResult<ShoppingList>> {
  try {
    // 1. Fetch original list and its items
    const listResult = await getShoppingList(listId);
    if (listResult.error || !listResult.data) {
      return { data: null, error: listResult.error || 'List not found' };
    }

    const itemsResult = await getShoppingListItems(listId);
    if (itemsResult.error) {
      return { data: null, error: itemsResult.error };
    }

    const originalList = listResult.data;
    const originalItems = itemsResult.data || [];

    // 2. Create new list with new name
    const listName = newName || `${originalList.name} (Copy)`;
    const newListResult = await createShoppingList(
      listName,
      originalList.list_type,
      originalList.description || undefined
    );

    if (newListResult.error || !newListResult.data) {
      return { data: null, error: newListResult.error || 'Failed to create list' };
    }

    const newList = newListResult.data;

    // 3. Copy all items from original (unchecked)
    if (originalItems.length > 0) {
      const itemsToAdd: Array<{
        item_name: string;
        category?: string;
        quantity?: string;
        estimated_price?: number;
        notes?: string;
        priority?: string;
        is_tool?: boolean;
      }> = originalItems.map(item => ({
        item_name: item.item_name,
        category: item.category || undefined,
        quantity: item.quantity || undefined,
        estimated_price: item.estimated_price || undefined,
        notes: item.notes || undefined,
        priority: item.priority || undefined,
        is_tool: item.is_tool || false,
      }));

      const addItemsResult = await addShoppingListItems(newList.id, itemsToAdd);
      if (addItemsResult.error) {
        // List created but items failed - still return the list
        console.error('Failed to copy items:', addItemsResult.error);
      }
    }

    // 4. Return new list
    return { data: newList, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get frequently bought items from user's shopping history
 */
export async function getFrequentlyBoughtItems(
  limit: number = 10
): Promise<ApiResult<Array<{ item_name: string; count: number; category?: string }>>> {
  try {
    const { data, error } = await supabase
      .rpc('get_frequently_bought_items', {
        item_limit: limit,
        days_back: 90,
      });

    if (error) {
      // If RPC doesn't exist yet, fall back to manual query
      console.warn('RPC not available, using fallback query:', error);

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('shopping_list_items')
        .select(`
          item_name,
          category,
          shopping_lists!inner(user_id)
        `)
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100);

      if (fallbackError) {
        return { data: null, error: fallbackError.message };
      }

      // Count occurrences manually
      const counts = new Map<string, { count: number; category?: string }>();
      fallbackData?.forEach(item => {
        const key = item.item_name.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { count: 1, category: item.category || undefined });
        }
      });

      // Sort by count and take top N
      const sorted = Array.from(counts.entries())
        .map(([name, data]) => ({
          item_name: name,
          count: data.count,
          category: data.category,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return { data: sorted, error: null };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Update budget for a shopping list
 */
export async function updateShoppingListBudget(
  listId: string,
  budget: number | null,
  currency: string = 'USD'
): Promise<ApiResult<ShoppingList>> {
  try {
    const { data, error } = await supabase
      .from('shopping_lists')
      .update({
        budget: budget,
        currency: currency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as ShoppingList, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// REAL-TIME COLLABORATION (Phase 3B, Feature #10)
// ============================================

export interface ShoppingListMember {
  id: string;
  list_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  added_at: string;
  added_by: string | null;
}

/**
 * Share a shopping list with another user by email
 */
export async function shareShoppingList(
  listId: string,
  email: string,
  role: 'editor' | 'viewer' = 'editor'
): Promise<ApiResult<ShoppingListMember>> {
  try {
    // First, find the user by email
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      return { data: null, error: 'User not found with that email' };
    }

    // Add the user as a member
    const { data, error } = await supabase
      .from('shopping_list_members')
      .insert({
        list_id: listId,
        user_id: userData.id,
        role,
        added_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'User already has access to this list' };
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get all members of a shopping list
 */
export async function getShoppingListMembers(
  listId: string
): Promise<ApiResult<ShoppingListMember[]>> {
  try {
    const { data, error } = await supabase
      .from('shopping_list_members')
      .select('*')
      .eq('list_id', listId)
      .order('role', { ascending: false }); // owners first

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Remove a member from a shopping list
 */
export async function removeShoppingListMember(
  listId: string,
  userId: string
): Promise<ApiResult<void>> {
  try {
    const { error } = await supabase
      .from('shopping_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', userId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: null, error: null };
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

// ============================================
// SMART SORTING FUNCTIONS
// ============================================

export interface SortedItem {
  name: string;
  section: string;
  sectionOrder: number;
  reasoning?: string;
}

export interface SmartSortResult {
  sortedItems: SortedItem[];
  sections: string[];
  originalCount: number;
  sortedCount: number;
}

/**
 * Smart sort shopping list items by typical store layout
 * Uses Gemini to organize items by sections (Produce → Frozen)
 */
export async function smartSortShoppingList(
  items: string[],
  storeType?: 'grocery' | 'walmart' | 'target' | 'kroger' | 'whole_foods'
): Promise<ApiResult<SmartSortResult>> {
  try {
    console.log('[API] smartSortShoppingList called with:', { items, storeType });

    const { data, error } = await supabase.functions.invoke('smart-sort-list', {
      body: { items, storeType },
    });

    console.log('[API] smartSortShoppingList response:', { data, error });

    if (error) {
      console.error('[API] Smart sort error:', error);
      return { data: null, error: error.message || JSON.stringify(error) };
    }

    if (!data?.sortedItems || !Array.isArray(data.sortedItems)) {
      console.error('[API] Invalid sort response:', data);
      return { data: null, error: 'Invalid response from smart sort' };
    }

    console.log('[API] Smart sort success:', data.sortedItems.length, 'items');
    return { data: data, error: null };
  } catch (error) {
    console.error('[API] Smart sort exception:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
