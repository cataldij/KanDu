/**
 * Advanced Diagnose Edge Function
 * Securely calls Gemini API for paid advanced diagnosis ($1.99)
 *
 * POST /functions/v1/diagnose-advanced
 * Body: { category, description, imageBase64?, videoBase64?, paymentIntentId? }
 * Returns: AdvancedDiagnosis object
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateDiagnosisRequest } from '../_shared/validation.ts';

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
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = validateDiagnosisRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400);
    }

    // TODO: Verify payment when Stripe is integrated
    // For now, we'll check for a payment flag or existing entitlement
    const { paymentIntentId } = body;

    // In production, verify the payment intent with Stripe
    // const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    // const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    // if (paymentIntent.status !== 'succeeded') {
    //   return errorResponse('Payment required', 402);
    // }

    // Rate limit check temporarily disabled for testing
    // TODO: Re-enable rate limiting after clearing old api_usage records
    const rateLimitResult = {
      allowed: true,
      remaining: 20,
      resetAt: new Date(Date.now() + 86400000),
    };
    console.log('[diagnose-advanced] Rate limit check bypassed for testing');

    // Get Gemini API key from environment (server-side only!)
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini with the latest Pro model
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Use Gemini 2.5 Pro for advanced analysis (latest & most capable model)
    const modelName = 'gemini-2.5-pro';
    const model = genAI.getGenerativeModel({ model: modelName });

    const { category, description, imageBase64, videoBase64 } = body;

    // Build the advanced prompt
    const promptText = `ADVANCED REPAIR GUIDE — $1.99 PREMIUM ANALYSIS

You are KanDu Advanced Diagnostic AI. The user paid $1.99 for a comprehensive, personalized repair guide.
CAREFULLY analyze the ${videoBase64 ? 'video (visual + audio)' : 'image'} and provide professional-grade guidance.

Category: ${category}
Problem description: ${description}

CRITICAL FIRST STEP - PRODUCT IDENTIFICATION:
Before ANYTHING else, you MUST carefully identify exactly what you're looking at:
- For vehicles: Study badges, logos, grille design, body shape, wheel design, interior details, dashboard layout to identify EXACT MAKE, MODEL, and YEAR (e.g., "2019 Audi A3 Sedan", "2022 Toyota Camry XSE", "2018 Ford F-150 Lariat")
- For appliances: Look for brand labels, model number stickers, distinctive design features (e.g., "Samsung RF28R7351SR French Door Refrigerator", "GE Profile PFE28KYNFS")
- For plumbing/electrical: Identify specific brands and components visible

DO NOT GUESS. If you see an Audi, say Audi. If you see a Toyota, say Toyota. Look at:
- Front grille shape and logo
- Body styling and proportions
- Interior design language
- Any visible badges or emblems

YOUR MISSION:
1. FIRST: Carefully identify the EXACT make/model/year of the product shown
2. Provide detailed diagnosis with evidence from what you observe
3. Create step-by-step repair instructions tailored to THIS SPECIFIC product
4. Recommend SPECIFIC PRODUCTS (brand + model + part numbers) for parts and tools
5. Provide comprehensive safety guidance
6. Include troubleshooting if the fix doesn't work
7. Recommend helpful YouTube videos that are specific to this make/model

OUTPUT (STRICT JSON ONLY):
{
  "diagnosis": {
    "summary": "Clear explanation of what's wrong (2-3 sentences)",
    "likelyCauses": ["Primary cause", "Secondary cause", "Other possibility"],
    "detailedAnalysis": "Comprehensive explanation with evidence from the image/video. Describe what you observed that led to this diagnosis.",
    "productIdentification": {
      "brand": "Exact brand name you identified (e.g., 'Audi', 'Samsung', 'Kohler')",
      "model": "Exact model you identified (e.g., 'A3 Sedan', 'RF28R7351SR', 'Highline K-78304')",
      "confidence": "high" | "medium" | "low",
      "alternativeMatches": ["If unsure, list alternative possibilities"]
    }
  },
  "triage": {
    "riskLevel": "low" | "medium" | "high",
    "urgency": "immediate" | "soon" | "can_wait",
    "isDIYable": true or false
  },
  "stepByStep": [
    "Step 1: Detailed first step with specific instructions for THIS make/model",
    "Step 2: ...",
    "Continue until repair is complete"
  ],
  "partsList": [
    {
      "name": "Brand + Model name with part number (e.g., 'Bosch 0281002315 MAF Sensor for Audi A3')",
      "searchTerms": "Optimized search terms including make/model/year",
      "estimatedCost": "$X-$Y",
      "partNumber": "OEM or aftermarket part number",
      "whereToBuy": "Amazon, RockAuto, AutoZone, Home Depot, etc."
    }
  ],
  "toolsList": [
    {
      "name": "Specific tool with size (e.g., 'Torx T25 screwdriver for Audi interior panels')",
      "searchTerms": "Optimized search terms",
      "estimatedCost": "$X-$Y or null if common",
      "required": true or false
    }
  ],
  "safetyWarnings": ["Critical safety warning 1", "Critical safety warning 2"],
  "detailedSafety": ["Detailed safety instruction 1", "Detailed safety instruction 2"],
  "troubleshooting": ["If [X happens], try [Y]", "If the problem persists..."],
  "youtubeVideos": [
    {
      "title": "Descriptive title INCLUDING the make/model",
      "searchQuery": "Specific search terms with EXACT make/model/year",
      "relevance": "Why this video helps with this specific repair"
    }
  ]
}

CRITICAL REQUIREMENTS:
- productIdentification MUST be the ACTUAL brand/model you observe - NEVER default to generic or random names
- If you see an Audi logo/design, the brand is "Audi", not "Honda"
- partsList: Recommend parts that are COMPATIBLE with the identified make/model
- YouTube searchQuery MUST include the actual make/model for relevant results
- This is a PAID service - users expect accurate, actionable guidance specific to THEIR product`;

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

    // Record usage
    await recordUsage(supabase, user.id, 'advanced_diagnosis', {
      category,
      hasImage: !!imageBase64,
      hasVideo: !!videoBase64,
      paymentIntentId,
    });

    // Return successful response
    return new Response(
      JSON.stringify({
        ...diagnosis,
        _meta: {
          remaining: rateLimitResult.remaining - 1,
          resetAt: rateLimitResult.resetAt.toISOString(),
          model: modelName,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Advanced diagnose function error:', err);
    console.error('Error type:', typeof err);
    console.error('Error constructor:', err?.constructor?.name);
    if (err instanceof Error) {
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
    }

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
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
    return errorResponse(`Advanced diagnosis error: ${message}`, 500);
  }
});
