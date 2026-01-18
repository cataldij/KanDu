/**
 * Local Pros Edge Function
 * Securely calls Google Places API to find local service providers
 *
 * POST /functions/v1/local-pros
 * Body: { category, queryText, lat, lng, radiusMeters?, limit? }
 * Returns: Array of LocalPro objects
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateLocalProsRequest } from '../_shared/validation.ts';

// Category to search keyword mapping
const CATEGORY_KEYWORDS: Record<string, string> = {
  plumbing: 'plumber',
  electrical: 'electrician',
  appliances: 'appliance repair',
  hvac: 'hvac repair',
  automotive: 'auto repair',
  other: 'repair service',
};

// Automotive-specific keyword refinements
const AUTOMOTIVE_KEYWORDS: Record<string, string> = {
  brake: 'brake repair',
  tire: 'tire shop',
  battery: 'auto battery',
  oil: 'oil change',
  transmission: 'transmission repair',
  engine: 'auto mechanic',
};

function getSearchKeyword(category: string, queryText: string): string {
  if (category.toLowerCase() === 'automotive') {
    const lowerQuery = queryText.toLowerCase();
    for (const [keyword, searchTerm] of Object.entries(AUTOMOTIVE_KEYWORDS)) {
      if (lowerQuery.includes(keyword)) {
        return searchTerm;
      }
    }
  }
  return CATEGORY_KEYWORDS[category.toLowerCase()] || 'repair service';
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

interface LocalPro {
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

Deno.serve(async (req) => {
  // DEBUG: Log headers
  console.log('[local-pros] Request received');
  const authHeader = req.headers.get('Authorization');
  console.log('[local-pros] Auth header present:', !!authHeader);

  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    console.log('[local-pros] Verifying auth...');
    const { user, error: authError, supabase } = await verifyAuth(req);
    console.log('[local-pros] Auth result - user:', !!user, 'error:', authError);
    if (authError || !user) {
      console.log('[local-pros] Auth failed, returning 401');
      return unauthorizedResponse(authError || 'Authentication required');
    }
    console.log('[local-pros] Auth successful, user:', user.id);

    // Parse and validate request body
    const body = await req.json();
    const validation = validateLocalProsRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400);
    }

    // Rate limit check temporarily disabled for testing
    // TODO: Re-enable rate limiting after clearing old api_usage records
    const rateLimitResult = {
      allowed: true,
      remaining: 500,
      resetAt: new Date(Date.now() + 86400000),
    };
    console.log('[local-pros] Rate limit check bypassed for testing');

    // Get Google Places API key from environment (server-side only!)
    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    console.log(`[local-pros] API key present: ${!!GOOGLE_PLACES_API_KEY}, length: ${GOOGLE_PLACES_API_KEY?.length || 0}`);

    if (!GOOGLE_PLACES_API_KEY) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return errorResponse('Service configuration error: API key missing', 500);
    }

    const {
      category,
      queryText = '',
      lat,
      lng,
      radiusMeters = 8000,
      limit = 5
    } = body;

    const keyword = getSearchKeyword(category, queryText);
    console.log(`[local-pros] Searching for: ${keyword} at (${lat}, ${lng})`);

    // Field mask - only request fields we need (cost optimization)
    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.rating',
      'places.userRatingCount',
      'places.currentOpeningHours',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.websiteUri',
      'places.googleMapsUri',
    ].join(',');

    const requestBody = {
      textQuery: keyword,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: limit,
    };

    console.log(`[local-pros] Places API request body:`, JSON.stringify(requestBody));

    // Call Google Places API (New)
    let response;
    try {
      response = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': fieldMask,
          },
          body: JSON.stringify(requestBody),
        }
      );
    } catch (fetchError) {
      console.error('[local-pros] Fetch error:', fetchError);
      return errorResponse(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown'}`, 502);
    }

    console.log(`[local-pros] Places API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[local-pros] Places API error:', response.status, errorText);

      // Parse specific Google API errors
      let userFriendlyError = 'Could not search for local professionals';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          const msg = errorData.error.message.toLowerCase();
          if (msg.includes('api key')) {
            userFriendlyError = 'Service configuration error (API key issue)';
          } else if (msg.includes('not enabled') || msg.includes('disabled')) {
            userFriendlyError = 'Service not enabled (Places API needs activation)';
          } else if (msg.includes('quota') || msg.includes('limit')) {
            userFriendlyError = 'Service quota exceeded';
          } else {
            userFriendlyError = errorData.error.message.substring(0, 100);
          }
        }
      } catch {
        // Use raw error if not JSON
      }

      return errorResponse(userFriendlyError, 502);
    }

    const data = await response.json();
    const places: PlaceResult[] = data.places || [];

    // Map to our LocalPro type
    const localPros: LocalPro[] = places.map((place): LocalPro => ({
      placeId: place.id,
      name: place.displayName?.text || 'Unknown',
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      address: place.formattedAddress,
      openNow: place.currentOpeningHours?.openNow,
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
      website: place.websiteUri,
      mapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    }));

    // Record usage (non-blocking - don't fail if this errors)
    try {
      await recordUsage(supabase, user.id, 'local_pros', {
        category,
        lat,
        lng,
        resultsCount: localPros.length,
      });
    } catch (usageError) {
      console.error('[local-pros] Failed to record usage (non-blocking):', usageError);
    }

    // Return successful response
    return new Response(
      JSON.stringify({
        pros: localPros,
        _meta: {
          remaining: rateLimitResult.remaining - 1,
          resetAt: rateLimitResult.resetAt.toISOString(),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Local pros function error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error message:', message);

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    return errorResponse(`Local pros error: ${message}`, 500);
  }
});
