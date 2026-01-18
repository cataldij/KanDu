/**
 * Find Substitute Edge Function
 * Analyzes camera frame to identify substitute items for missing materials
 *
 * POST /functions/v1/find-substitute
 * Body: { imageBase64, missingItem, category, stepInstruction, bannedItems? }
 * Returns: { suggestedSubstitute, reason, confidence, highlights }
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';

interface FindSubstituteRequest {
  imageBase64: string;
  missingItem: string;
  category: string;
  stepInstruction: string;
  bannedItems?: string[];
}

function validateRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { imageBase64, missingItem, category, stepInstruction } = body as Record<string, unknown>;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { valid: false, error: 'Image is required' };
  }

  if (!missingItem || typeof missingItem !== 'string') {
    return { valid: false, error: 'Missing item name is required' };
  }

  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  if (!stepInstruction || typeof stepInstruction !== 'string') {
    return { valid: false, error: 'Step instruction is required' };
  }

  return { valid: true };
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
    console.log('[find-substitute] Function started');

    // Verify authentication
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      console.log('[find-substitute] Auth failed:', authError);
      return unauthorizedResponse(authError || 'Authentication required');
    }
    console.log('[find-substitute] Auth OK, user:', user.id);

    // Parse and validate request body
    const body = await req.json();
    console.log('[find-substitute] Request received:', {
      missingItem: body.missingItem,
      category: body.category,
      imageLength: body.imageBase64?.length || 0,
      bannedItemsCount: body.bannedItems?.length || 0,
    });

    const validation = validateRequest(body);
    if (!validation.valid) {
      console.log('[find-substitute] Validation failed:', validation.error);
      return errorResponse(validation.error!, 400);
    }
    console.log('[find-substitute] Validation OK');

    // Rate limit check (uses guided_fix limit)
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS.GUIDED_FIX
    );

    console.log(`[find-substitute] Rate limit check: allowed=${rateLimitResult.allowed}, remaining=${rateLimitResult.remaining}`);

    // Get Gemini API key from environment
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini with structured output
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Define the response schema
    const substituteSchema = {
      type: "object",
      properties: {
        foundSubstitute: {
          type: "boolean",
          description: "Whether a suitable substitute was found in the frame"
        },
        suggestedSubstitute: {
          type: "string",
          description: "The name of the substitute item found",
          nullable: true
        },
        reason: {
          type: "string",
          description: "Why this substitute will work for the step"
        },
        confidence: {
          type: "number",
          description: "Confidence score 0.0-1.0 that this substitute will work"
        },
        instruction: {
          type: "string",
          description: "How to use this substitute in the current step"
        },
        otherOptions: {
          type: "array",
          description: "Other potential substitutes seen in frame (up to 2)",
          items: { type: "string" }
        },
        highlight: {
          type: "object",
          description: "Bounding box for the suggested substitute",
          properties: {
            label: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" }
          },
          nullable: true
        }
      },
      required: ["foundSubstitute", "reason", "confidence", "instruction"]
    };

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: substituteSchema,
      },
    });

    const {
      imageBase64,
      missingItem,
      category,
      stepInstruction,
      bannedItems
    } = body as FindSubstituteRequest;

    // Build the prompt
    const promptText = `FIND SUBSTITUTE ITEM

The user is doing a ${category} repair and needs a SUBSTITUTE for: "${missingItem}"

Current step: "${stepInstruction}"

${bannedItems && bannedItems.length > 0 ? `
⛔ BANNED ITEMS (user doesn't have these either):
${bannedItems.map(item => `- ${item}`).join('\n')}
Do NOT suggest any banned items.
` : ''}

YOUR TASK:
1. Analyze the image to identify items that could substitute for "${missingItem}"
2. Consider what the item is used for in the step
3. Find the BEST available substitute visible in the frame

GOOD SUBSTITUTES for common items:
- Aluminum foil → wax paper, parchment paper, plastic wrap (for some uses)
- Duct tape → electrical tape, masking tape, packing tape
- Wrench → pliers, adjustable pliers, channel locks
- Screwdriver → butter knife (flathead only), coin
- Bucket → large bowl, pot, plastic container
- Towel → old t-shirt, rags, paper towels

If you see a suitable substitute:
- Set foundSubstitute=true
- Provide the item name in suggestedSubstitute
- Explain WHY it works in reason
- Give confidence based on how well it will work
- Provide a highlight bounding box

If NO suitable substitute is visible:
- Set foundSubstitute=false
- Explain what would work in reason
- Set confidence to 0

OUTPUT JSON with your analysis.`;

    // Build content parts
    const contentParts = [
      { text: promptText },
      { text: "USER'S AVAILABLE ITEMS (analyze this image):" },
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg',
        },
      },
    ];

    // Call Gemini API
    console.log('[find-substitute] Calling Gemini API...');
    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();
    console.log('[find-substitute] Response:', text.substring(0, 300));

    // Parse response
    let substituteResult;
    try {
      substituteResult = JSON.parse(text);
    } catch (parseError) {
      console.warn('[find-substitute] JSON parse failed, trying regex fallback');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return errorResponse('Failed to parse AI response', 500);
      }
      substituteResult = JSON.parse(jsonMatch[0]);
    }

    // Record usage
    recordUsage(supabase, user.id, 'find_substitute', {
      category,
      missingItem,
      foundSubstitute: substituteResult.foundSubstitute,
    });

    // Return response
    return new Response(
      JSON.stringify({
        ...substituteResult,
        _meta: {
          remaining: rateLimitResult.remaining - 1,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[find-substitute] Function error:', error.message);
    console.error('[find-substitute] Error stack:', error.stack);
    console.error('[find-substitute] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    const errorMessage = error.message || 'Unknown error';

    // Log detailed info for debugging
    console.error('[find-substitute] Error analysis:', {
      message: errorMessage,
      includes429: errorMessage.includes('429'),
      includesQuota: errorMessage.includes('quota'),
      includesRate: errorMessage.includes('rate'),
      includesLimit: errorMessage.includes('limit'),
      includesResource: errorMessage.includes('RESOURCE_EXHAUSTED'),
      includesSafety: errorMessage.includes('SAFETY'),
      includesBlocked: errorMessage.includes('blocked'),
    });

    if (errorMessage.includes('SAFETY') || errorMessage.includes('blocked')) {
      return errorResponse('Content was blocked by safety filters. Please try a different image.', 400);
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return errorResponse(`Gemini API rate limit exceeded (2.0-flash). Error: ${errorMessage.substring(0, 150)}`, 429);
    }

    return errorResponse(`Failed to find substitute: ${errorMessage.substring(0, 150)}`, 500);
  }
});
