/**
 * Diagnose Edge Function
 * Securely calls Gemini API for free diagnosis
 *
 * POST /functions/v1/diagnose
 * Body: { category, description, imageBase64?, videoBase64? }
 * Returns: FreeDiagnosis object
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse, successResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateDiagnosisRequest } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  // DEBUG: Log all headers received
  console.log('[diagnose] Request received');
  console.log('[diagnose] Method:', req.method);
  const authHeader = req.headers.get('Authorization');
  console.log('[diagnose] Auth header present:', !!authHeader);
  if (authHeader) {
    console.log('[diagnose] Auth header starts with:', authHeader.substring(0, 30));
  }

  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    console.log('[diagnose] Verifying auth...');
    const { user, error: authError, supabase } = await verifyAuth(req);
    console.log('[diagnose] Auth result - user:', !!user, 'error:', authError);
    if (authError || !user) {
      console.log('[diagnose] Auth failed, returning 401');
      return unauthorizedResponse(authError || 'Authentication required');
    }
    console.log('[diagnose] Auth successful, user:', user.id);

    // Parse and validate request body
    const body = await req.json();
    const validation = validateDiagnosisRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400);
    }

    // Rate limit check temporarily disabled for testing
    // TODO: Re-enable rate limiting after clearing old api_usage records
    const rateLimitResult = {
      allowed: true,
      remaining: 100,
      resetAt: new Date(Date.now() + 86400000),
    };
    console.log('[diagnose] Rate limit check bypassed for testing');

    // Get Gemini API key from environment (server-side only!)
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini with 2.5 Flash for cost-effective diagnosis
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const { category, description, imageBase64, videoBase64 } = body;

    // Build the prompt
    const promptText = `FREE DIAGNOSIS — ${videoBase64 ? 'VIDEO' : 'IMAGE'} ANALYSIS

You are KanDu Free Diagnostic AI. CAREFULLY analyze the ${videoBase64 ? 'video (visual + audio)' : 'image'} and provide a quick, helpful triage.

Category: ${category}
Problem description: ${description}

CRITICAL FIRST STEP - PRODUCT IDENTIFICATION:
Before diagnosing, you MUST carefully identify what you're looking at:
- For vehicles: Look for badges, logos, grille design, body shape, interior details to identify MAKE and MODEL (e.g., "Audi A3", "Toyota Camry", "Ford F-150")
- For appliances: Look for brand labels, model numbers, distinctive features (e.g., "Samsung RF28R7351SR Refrigerator", "GE Profile Dishwasher")
- For plumbing/electrical: Identify specific components visible (e.g., "Kohler toilet with Fluidmaster 400A fill valve")

YOUR TASK:
1. FIRST: Carefully identify the exact make/model/brand of the item shown - DO NOT GUESS if unsure
2. Provide a clear, concise diagnosis (2-3 sentences) specific to THIS product
3. List 2-3 likely causes
4. Assess risk level and urgency
5. Determine if this is DIY-able or needs a pro
6. Recommend 3 helpful YouTube videos with search queries that include the ACTUAL make/model
7. List critical safety warnings
8. Suggest immediate next steps

OUTPUT (STRICT JSON ONLY):
{
  "detectedItem": {
    "label": "Exact Make + Model (e.g., '2019 Audi A3', 'Samsung RF28R7351SR Refrigerator', 'Kohler Highline Toilet')",
    "confidence": "high" | "medium" | "low"
  },
  "diagnosis": {
    "summary": "Clear 2-3 sentence explanation of what's likely wrong with THIS specific product",
    "likelyCauses": [
      "Most likely cause 1",
      "Possible cause 2",
      "Possible cause 3"
    ]
  },
  "triage": {
    "riskLevel": "low" | "medium" | "high",
    "urgency": "immediate" | "soon" | "can_wait",
    "isDIYable": true or false
  },
  "youtubeVideos": [
    {
      "title": "Descriptive title including the actual make/model",
      "searchQuery": "exact search terms INCLUDING the make/model to find relevant videos",
      "relevance": "Why this video helps with this specific issue"
    }
  ],
  "safetyWarnings": [
    "Critical safety warning 1",
    "Critical safety warning 2"
  ],
  "nextSteps": [
    "Immediate action to take",
    "Second step or alternative",
    "Third option"
  ]
}

CRITICAL REQUIREMENTS:
- detectedItem.label MUST be the ACTUAL brand/make/model you see - never guess or use generic names like "Honda Civic" if you see an Audi
- Look carefully at all visual details: badges, logos, grille patterns, interior styling, body shape
- If you cannot confidently identify the exact model, say "Unknown [category]" with low confidence
- YouTube searchQuery MUST include the actual identified make/model for relevant results`;

    // Build content parts
    const contentParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: promptText }
    ];

    if (imageBase64) {
      contentParts.push({
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg',
        },
      });
    }

    if (videoBase64) {
      contentParts.push({
        inlineData: {
          data: videoBase64,
          mimeType: 'video/mp4',
        },
      });
    }

    // Call Gemini API
    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Invalid Gemini response:', text.substring(0, 500));
      return errorResponse('Failed to parse AI response', 500);
    }

    const diagnosis = JSON.parse(jsonMatch[0]);

    // Record usage for rate limiting
    await recordUsage(supabase, user.id, 'free_diagnosis', {
      category,
      hasImage: !!imageBase64,
      hasVideo: !!videoBase64,
    });

    // Return successful response with rate limit info
    return new Response(
      JSON.stringify({
        ...diagnosis,
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
    console.error('Diagnose function error:', err);
    console.error('Error type:', typeof err);
    console.error('Error constructor:', err?.constructor?.name);
    if (err instanceof Error) {
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
    }

    // Handle specific error types
    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    const message = err instanceof Error ? err.message : 'Unknown error';

    // Don't expose internal error details in production, but log them
    console.error('Full error message:', message);

    if (message.includes('API key') || message.includes('API_KEY')) {
      return errorResponse('API key error - check configuration', 503);
    }
    if (message.includes('quota') || message.includes('QUOTA')) {
      return errorResponse('API quota exceeded', 503);
    }
    if (message.includes('relation') && message.includes('does not exist')) {
      return errorResponse('Database table missing - run migrations', 500);
    }
    if (message.includes('permission denied')) {
      return errorResponse('Database permission error', 500);
    }

    // Return detailed error for debugging
    return errorResponse(`Diagnosis error: ${message}`, 500);
  }
});
