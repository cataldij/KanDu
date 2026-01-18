/**
 * Local Pros Service
 *
 * SECURITY UPDATE: This module now uses Supabase Edge Functions
 * instead of calling Google Places API directly.
 * API keys are kept server-side for security.
 */

import * as api from './api';

// Re-export types for backwards compatibility
export type { LocalPro } from './api';

// Category to search keyword mapping (kept for buildMapsSearchUrl)
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

/**
 * Get local service providers for the given category and location
 * Uses Supabase Edge Function to securely call Google Places API
 */
export async function getLocalPros(params: {
  category: string;
  queryText: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}): Promise<api.LocalPro[]> {
  const { data, error } = await api.getLocalPros({
    category: params.category,
    queryText: params.queryText,
    lat: params.lat,
    lng: params.lng,
    radiusMeters: params.radiusMeters || 8000,
    limit: params.limit || 5,
  });

  if (error) {
    // Log as warning instead of error to avoid triggering error overlays
    console.log('[LocalPros] Service error:', error);

    // Throw descriptive error so it shows in the UI
    throw new Error(`Local pros failed: ${error}`);
  }

  return data?.pros || [];
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
