/**
 * Local Pros Service - Google Places API (New) integration
 *
 * Setup: Add EXPO_PUBLIC_GOOGLE_PLACES_API_KEY to your .env file
 * Get an API key from: https://console.cloud.google.com/apis/credentials
 * Enable: Places API (New) in your Google Cloud project
 */

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

export type LocalPro = {
  placeId: string;
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
  openNow?: boolean;
  phone?: string;
  website?: string;
  mapsUrl?: string;
};

// In-memory cache with 5-minute TTL
interface CacheEntry {
  data: LocalPro[];
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Category to search keyword mapping
const CATEGORY_KEYWORDS: Record<string, string> = {
  plumbing: 'plumber',
  electrical: 'electrician',
  appliances: 'appliance repair',
  hvac: 'hvac repair',
  automotive: 'auto repair',
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

function getCacheKey(category: string, lat: number, lng: number, queryText: string): string {
  // Round lat/lng to ~1km precision for cache efficiency
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  return `${category}:${roundedLat}:${roundedLng}:${queryText.toLowerCase().substring(0, 50)}`;
}

function getFromCache(key: string): LocalPro[] | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache(key: string, data: LocalPro[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function getSearchKeyword(category: string, queryText: string): string {
  // For automotive, try to find a more specific keyword
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

// Places API (New) response types
interface PlaceNewResult {
  id: string;
  displayName?: {
    text: string;
  };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
  };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

interface NearbySearchNewResponse {
  places?: PlaceNewResult[];
}

export async function getLocalPros(params: {
  category: string;
  queryText: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}): Promise<LocalPro[]> {
  const { category, queryText, lat, lng, radiusMeters = 8000, limit = 5 } = params;

  if (!GOOGLE_PLACES_API_KEY) {
    console.warn('Google Places API key not configured');
    return [];
  }

  // Check cache first
  const cacheKey = getCacheKey(category, lat, lng, queryText);
  const cached = getFromCache(cacheKey);
  if (cached) {
    if (__DEV__) console.log('LocalPros: Cache hit for', cacheKey);
    return cached;
  }

  try {
    const keyword = getSearchKeyword(category, queryText);
    if (__DEV__) console.log('LocalPros: Searching for', keyword, 'near', lat, lng);

    // Use Places API (New) - Nearby Search
    // Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search
    const requestBody = {
      includedTypes: ['establishment'],
      maxResultCount: limit,
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radiusMeters,
        },
      },
      // Text query to find relevant businesses
      textQuery: keyword,
    };

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

    // Use Text Search (New) which is better for keyword-based searches
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify({
          textQuery: `${keyword} near me`,
          locationBias: {
            circle: {
              center: {
                latitude: lat,
                longitude: lng,
              },
              radius: radiusMeters,
            },
          },
          maxResultCount: limit,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Places API (New) error:', response.status, errorText);
      return [];
    }

    const data: NearbySearchNewResponse = await response.json();
    const places = data.places || [];

    if (places.length === 0) {
      setCache(cacheKey, []);
      return [];
    }

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

    // Cache the results
    setCache(cacheKey, localPros);

    if (__DEV__) console.log('LocalPros: Found', localPros.length, 'results');
    return localPros;
  } catch (error) {
    console.error('LocalPros error:', error);
    return [];
  }
}

/**
 * Generate a call script for the user to use when calling a pro
 */
export function generateCallScript(params: {
  detectedItem?: string;
  diagnosisSummary: string;
  likelyCause?: string;
}): string {
  const { detectedItem, diagnosisSummary, likelyCause } = params;

  let script = 'Hi, I need help with ';

  if (detectedItem) {
    script += `my ${detectedItem}. `;
  } else {
    script += 'a home repair issue. ';
  }

  // Add diagnosis summary (simplified)
  const simplifiedSummary = diagnosisSummary
    .split('.')[0] // Take first sentence
    .replace(/^(The |Your |It |This )/i, '') // Remove common starting words
    .trim();

  if (simplifiedSummary) {
    script += `${simplifiedSummary}. `;
  }

  if (likelyCause) {
    script += `I think it might be ${likelyCause.toLowerCase()}. `;
  }

  script += 'Can you help me with this?';

  return script;
}

/**
 * Build a Google Maps search URL as a fallback when location is denied
 */
export function buildMapsSearchUrl(category: string, queryText: string): string {
  const keyword = getSearchKeyword(category, queryText);
  return `https://www.google.com/maps/search/${encodeURIComponent(keyword + ' near me')}`;
}
