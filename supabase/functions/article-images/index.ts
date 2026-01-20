/**
 * Article Images Edge Function
 * Uses Gemini to generate optimal search terms, then fetches images from Unsplash
 * Results are cached server-side in Supabase and refreshed daily
 *
 * POST /functions/v1/article-images
 * Body: { titles: string[] }
 * Returns: Array of { title, searchTerm, thumbnailUrl, fullUrl }
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse, successResponse } from '../_shared/auth.ts';

interface ArticleImage {
  title: string;
  searchTerm: string;
  thumbnailUrl: string;
  fullUrl: string;
}

interface GeminiSearchTerm {
  title: string;
  searchTerm: string;
}

interface CacheEntry {
  id: string;
  cache_key: string;
  images: ArticleImage[];
  created_at: string;
  expires_at: string;
}

/**
 * Generate a cache key based on the date and sorted titles
 * This ensures the same set of titles always hits the same cache entry
 */
function generateCacheKey(titles: string[]): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sortedTitles = [...titles].sort().join('|');
  // Use a simple hash of the titles to keep the key short
  const titlesHash = sortedTitles.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36);
  return `daily_tips_${today}_${titlesHash}`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    // Parse request body
    const body = await req.json();
    const { titles } = body;

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return errorResponse('titles array is required', 400);
    }

    console.log('[article-images] Processing', titles.length, 'titles');

    // Create service role client for cache operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache first
    const cacheKey = generateCacheKey(titles);
    console.log('[article-images] Checking cache with key:', cacheKey);

    const { data: cachedData, error: cacheError } = await supabaseAdmin
      .from('article_images_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cachedData && !cacheError) {
      console.log('[article-images] Cache HIT - returning cached images');
      return successResponse({ images: cachedData.images, cached: true });
    }

    console.log('[article-images] Cache MISS - generating new images');

    // Get API keys from environment
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY');

    if (!GEMINI_API_KEY) {
      console.error('[article-images] GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    if (!UNSPLASH_ACCESS_KEY) {
      console.error('[article-images] UNSPLASH_ACCESS_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Step 1: Use Gemini to generate optimal search terms
    console.log('[article-images] Generating search terms with Gemini...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const searchTermSchema = {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              searchTerm: { type: "string" }
            },
            required: ["title", "searchTerm"]
          }
        }
      },
      required: ["results"]
    };

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: searchTermSchema,
      },
    });

    const prompt = `For each DIY home repair article title below, generate an optimal Unsplash search query.

REQUIREMENTS:
- The search query should find a HIGH-QUALITY photo showing:
  1. Hands actively doing the repair task (preferred)
  2. OR the specific tool/item being used
  3. OR a close-up of the repair area
- Keep search terms to 3-5 words for best results
- Focus on ACTION and VISUALS, not abstract concepts
- Avoid generic terms like "home repair" or "DIY"

EXAMPLES:
- "Replace HVAC Filter" → "hands replacing air filter"
- "Fix Leaky Faucet" → "plumber fixing faucet drip"
- "Unclog Drain" → "drain snake bathroom sink"
- "Install Smart Outlet" → "smart plug electrical outlet"

TITLES TO PROCESS:
${titles.map((t: string, i: number) => `${i + 1}. "${t}"`).join('\n')}

Return JSON with optimized search terms for each title.`;

    const result = await model.generateContent([{ text: prompt }]);
    const response = await result.response;
    const text = response.text();

    console.log('[article-images] Gemini response:', text.substring(0, 300));

    let searchTerms: GeminiSearchTerm[];
    try {
      const parsed = JSON.parse(text);
      searchTerms = parsed.results;
    } catch (parseError) {
      console.error('[article-images] Failed to parse Gemini response:', parseError);
      // Fallback: use titles directly as search terms
      searchTerms = titles.map((title: string) => ({ title, searchTerm: title }));
    }

    console.log('[article-images] Search terms generated:', searchTerms.length);

    // Step 2: Fetch images from Unsplash for each search term
    const articleImages: ArticleImage[] = [];

    for (const item of searchTerms) {
      try {
        const searchUrl = new URL('https://api.unsplash.com/search/photos');
        searchUrl.searchParams.set('query', item.searchTerm);
        searchUrl.searchParams.set('per_page', '1');
        searchUrl.searchParams.set('orientation', 'squarish');

        const unsplashResponse = await fetch(searchUrl.toString(), {
          headers: {
            'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          },
        });

        if (!unsplashResponse.ok) {
          console.error('[article-images] Unsplash error for', item.title, ':', unsplashResponse.status);
          // Use a fallback image
          articleImages.push({
            title: item.title,
            searchTerm: item.searchTerm,
            thumbnailUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop',
            fullUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1080',
          });
          continue;
        }

        const unsplashData = await unsplashResponse.json();

        if (unsplashData.results && unsplashData.results.length > 0) {
          const photo = unsplashData.results[0];
          articleImages.push({
            title: item.title,
            searchTerm: item.searchTerm,
            thumbnailUrl: photo.urls.small, // ~400px
            fullUrl: photo.urls.regular, // ~1080px
          });
          console.log('[article-images] Found image for', item.title);
        } else {
          console.warn('[article-images] No results for', item.searchTerm);
          // Use fallback
          articleImages.push({
            title: item.title,
            searchTerm: item.searchTerm,
            thumbnailUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop',
            fullUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1080',
          });
        }
      } catch (fetchError) {
        console.error('[article-images] Error fetching image for', item.title, ':', fetchError);
        articleImages.push({
          title: item.title,
          searchTerm: item.searchTerm,
          thumbnailUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop',
          fullUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1080',
        });
      }
    }

    console.log('[article-images] Returning', articleImages.length, 'images');

    // Save to cache for future requests (expires at midnight UTC tomorrow)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    try {
      // Upsert to handle race conditions - if another request already cached, just update
      const { error: upsertError } = await supabaseAdmin
        .from('article_images_cache')
        .upsert({
          cache_key: cacheKey,
          images: articleImages,
          expires_at: tomorrow.toISOString(),
        }, {
          onConflict: 'cache_key',
        });

      if (upsertError) {
        console.error('[article-images] Failed to cache images:', upsertError);
        // Don't fail the request if caching fails
      } else {
        console.log('[article-images] Cached images with key:', cacheKey, 'expires:', tomorrow.toISOString());
      }
    } catch (cacheWriteError) {
      console.error('[article-images] Cache write error:', cacheWriteError);
      // Don't fail the request if caching fails
    }

    return successResponse({ images: articleImages, cached: false });

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[article-images] Function error:', error.message);
    console.error('[article-images] Error stack:', error.stack);

    return errorResponse(`Failed to fetch article images: ${error.message}`, 500);
  }
});
