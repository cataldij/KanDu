/**
 * Test Store Scraping - Experimental
 *
 * Tests if we can get aisle data from various grocery store websites
 * Uses Gemini to extract structured data from HTML
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/auth.ts';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') || '');

interface StoreScrapingRequest {
  store: 'walmart' | 'target' | 'kroger';
  zipCode: string;
  items: string[];
}

interface AisleData {
  item: string;
  aisle: string | null;
  section: string | null;
  inStock: boolean;
  price?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const { store, zipCode, items } = await req.json() as StoreScrapingRequest;

    if (!store || !zipCode || !items || items.length === 0) {
      return errorResponse('Missing required fields: store, zipCode, items', 400);
    }

    console.log(`[test-store-scrape] Testing ${store} scraping for ${items.length} items`);

    let results: AisleData[] = [];

    switch (store) {
      case 'walmart':
        results = await scrapeWalmart(zipCode, items);
        break;
      case 'target':
        results = await scrapeTarget(zipCode, items);
        break;
      case 'kroger':
        results = await scrapeKroger(zipCode, items);
        break;
      default:
        return errorResponse('Unsupported store', 400);
    }

    return new Response(
      JSON.stringify({
        success: true,
        store,
        zipCode,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('[test-store-scrape] Error:', error);
    return errorResponse(error.message || 'Failed to scrape store data', 500);
  }
});

/**
 * Scrape Walmart for aisle data
 */
async function scrapeWalmart(zipCode: string, items: string[]): Promise<AisleData[]> {
  const results: AisleData[] = [];

  for (const item of items) {
    try {
      // Walmart search URL
      const searchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(item)}`;

      console.log(`[Walmart] Fetching: ${searchUrl}`);

      // Fetch the page
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        console.error(`[Walmart] Failed to fetch: ${response.status}`);
        results.push({
          item,
          aisle: null,
          section: null,
          inStock: false,
        });
        continue;
      }

      const html = await response.text();

      // Log first 500 chars to see what we got
      console.log(`[Walmart] HTML preview:`, html.substring(0, 500));

      // Use Gemini to extract aisle data
      const aisleData = await extractAisleDataWithGemini(html, item, 'walmart');
      results.push(aisleData);

    } catch (error: any) {
      console.error(`[Walmart] Error scraping ${item}:`, error.message);
      results.push({
        item,
        aisle: null,
        section: null,
        inStock: false,
      });
    }
  }

  return results;
}

/**
 * Scrape Target for aisle data
 */
async function scrapeTarget(zipCode: string, items: string[]): Promise<AisleData[]> {
  const results: AisleData[] = [];

  for (const item of items) {
    try {
      // Target search URL
      const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(item)}`;

      console.log(`[Target] Fetching: ${searchUrl}`);

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        results.push({ item, aisle: null, section: null, inStock: false });
        continue;
      }

      const html = await response.text();
      const aisleData = await extractAisleDataWithGemini(html, item, 'target');
      results.push(aisleData);

    } catch (error: any) {
      console.error(`[Target] Error:`, error.message);
      results.push({ item, aisle: null, section: null, inStock: false });
    }
  }

  return results;
}

/**
 * Scrape Kroger for aisle data
 */
async function scrapeKroger(zipCode: string, items: string[]): Promise<AisleData[]> {
  const results: AisleData[] = [];

  for (const item of items) {
    try {
      const searchUrl = `https://www.kroger.com/search?query=${encodeURIComponent(item)}`;

      console.log(`[Kroger] Fetching: ${searchUrl}`);

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        results.push({ item, aisle: null, section: null, inStock: false });
        continue;
      }

      const html = await response.text();
      const aisleData = await extractAisleDataWithGemini(html, item, 'kroger');
      results.push(aisleData);

    } catch (error: any) {
      console.error(`[Kroger] Error:`, error.message);
      results.push({ item, aisle: null, section: null, inStock: false });
    }
  }

  return results;
}

/**
 * Use Gemini to extract aisle data from HTML
 */
async function extractAisleDataWithGemini(
  html: string,
  itemName: string,
  store: string
): Promise<AisleData> {
  try {
    // Truncate HTML to avoid token limits (keep first 50k chars)
    const truncatedHtml = html.substring(0, 50000);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
You are analyzing a ${store} product search page for "${itemName}".

Extract the following information from this HTML:
1. Aisle number (e.g., "Aisle A23", "Aisle 12", etc.)
2. Section/department (e.g., "Dairy", "Produce", "Frozen")
3. Whether the item is in stock
4. Price if available

HTML:
${truncatedHtml}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "item": "${itemName}",
  "aisle": "Aisle A23" or null,
  "section": "Dairy" or null,
  "inStock": true or false,
  "price": "$3.99" or null
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    console.log(`[Gemini] Raw response for ${itemName}:`, responseText);

    // Try to parse JSON (strip markdown if present)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const aisleData = JSON.parse(jsonMatch[0]);
    return aisleData as AisleData;

  } catch (error: any) {
    console.error(`[Gemini] Failed to extract data:`, error.message);
    return {
      item: itemName,
      aisle: null,
      section: null,
      inStock: false,
    };
  }
}
