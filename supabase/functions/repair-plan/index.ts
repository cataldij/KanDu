/**
 * Repair Plan Edge Function
 * Generates step-by-step repair plans using Gemini API
 *
 * POST /functions/v1/repair-plan
 * Body: { category, diagnosisSummary, likelyCause? }
 * Returns: Array of RepairStep objects
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateRepairPlanRequest } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    console.log('[repair-plan] Function started');

    // Verify authentication
    console.log('[repair-plan] Verifying auth...');
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      console.log('[repair-plan] Auth failed:', authError);
      return unauthorizedResponse(authError || 'Authentication required');
    }
    console.log('[repair-plan] Auth OK, user:', user.id);

    // Parse and validate request body
    console.log('[repair-plan] Parsing request body...');
    const body = await req.json();
    console.log('[repair-plan] Body received:', { category: body.category, diagnosisLength: body.diagnosisSummary?.length });
    const validation = validateRepairPlanRequest(body);
    if (!validation.valid) {
      console.log('[repair-plan] Validation failed:', validation.error);
      return errorResponse(validation.error!, 400);
    }
    console.log('[repair-plan] Validation OK');

    // Rate limit check temporarily disabled for testing
    // TODO: Re-enable rate limiting after clearing old api_usage records
    const rateLimitResult = {
      allowed: true,
      remaining: 20,
      resetAt: new Date(Date.now() + 86400000),
    };
    console.log('[repair-plan] Rate limit check bypassed for testing');

    // Get Gemini API key from environment
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('[repair-plan] GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }
    console.log('[repair-plan] Gemini API key present');

    // Initialize Gemini - using gemini-2.5-flash for better reasoning/planning
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Define JSON schema for structured output - guarantees consistent response format
    const repairPlanSchema = {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Array of repair steps in order",
          items: {
            type: "object",
            properties: {
              stepNumber: {
                type: "integer",
                description: "Step number starting from 1"
              },
              instruction: {
                type: "string",
                description: "Action-oriented instruction starting with a verb"
              },
              safetyNote: {
                type: "string",
                description: "Safety warning if applicable",
                nullable: true
              },
              lookingFor: {
                type: "string",
                description: "Specific visual target for AI detection"
              },
              completionCriteria: {
                type: "string",
                description: "How AI knows this step is done"
              },
              visualAnchors: {
                type: "array",
                description: "Key visual elements to look for",
                items: { type: "string" }
              },
              toolsNeeded: {
                type: "array",
                description: "Tools required for this step",
                items: { type: "string" }
              },
              materialsNeeded: {
                type: "array",
                description: "Materials/parts required for this step",
                items: { type: "string" }
              }
            },
            required: ["stepNumber", "instruction", "lookingFor", "completionCriteria", "visualAnchors", "toolsNeeded", "materialsNeeded"]
          }
        }
      },
      required: ["steps"]
    };

    // Using gemini-2.5-flash for better reasoning/planning capabilities
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: repairPlanSchema,
      },
    });
    console.log('[repair-plan] Gemini model initialized (gemini-2.5-flash with structured output)');

    const { category, diagnosisSummary, likelyCause, bannedItems, confirmedSubstitutes } = body;

    // Build the prompt - Enhanced for precise visual detection
    const promptText = `GENERATE CAMERA-GUIDED REPAIR PLAN

Category: ${category}
Problem: ${diagnosisSummary}
${likelyCause ? `Likely Cause: ${likelyCause}` : ''}
${bannedItems && Array.isArray(bannedItems) && bannedItems.length > 0 ? `
⛔ BANNED ITEMS - DO NOT USE:
The user does NOT have these items. You MUST create a plan that does NOT require ANY of these:
${bannedItems.map((item: string) => `- ${item}`).join('\n')}

CRITICAL: Design alternative steps that work WITHOUT the banned items above.
Do NOT include ANY banned item in toolsNeeded or materialsNeeded arrays.
` : ''}${confirmedSubstitutes && typeof confirmedSubstitutes === 'object' && Object.keys(confirmedSubstitutes).length > 0 ? `
✅ CONFIRMED SUBSTITUTES - USE THESE SPECIFIC ITEMS:
The user has CONFIRMED they have these substitute items. ALWAYS use the SUBSTITUTE item name, not the original:
${Object.entries(confirmedSubstitutes).map(([original, substitute]) => `- Use "${substitute}" instead of "${original}"`).join('\n')}

IMPORTANT:
- Include the SUBSTITUTE item names in toolsNeeded/materialsNeeded arrays
- Write instructions referring to the substitute by name (e.g., "the wax paper" not "the aluminum foil")
- Do NOT use the original item names in any step
` : ''}
Create a repair plan optimized for AI-assisted camera guidance. Each step must have CLEAR VISUAL COMPLETION CRITERIA.

OUTPUT (STRICT JSON):
{
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "Action-oriented instruction (verb first, e.g., 'Locate the P-trap pipe under your sink')",
      "safetyNote": "Safety warning if applicable, or null",
      "lookingFor": "SPECIFIC visual target for AI detection (e.g., 'Curved white/gray PVC pipe shaped like letter P or U')",
      "completionCriteria": "How AI knows this step is DONE (e.g., 'P-trap pipe is clearly visible in center of frame')",
      "visualAnchors": ["List", "of", "key", "visual", "elements"],
      "toolsNeeded": ["List of tools needed for THIS step, or empty array if none"],
      "materialsNeeded": ["List of materials/parts needed for THIS step, or empty array if none"]
    }
  ]
}

REQUIREMENTS FOR EACH STEP:
1. INSTRUCTION: Start with an action verb (Locate, Remove, Turn, Disconnect, etc.)
2. LOOKING FOR: Describe the visual target with:
   - Color, shape, material, size
   - Position relative to other components
   - Distinguishing features
3. COMPLETION CRITERIA: Define what "done" looks like:
   - What should be visible/not visible
   - What state the component should be in
   - What the camera should see when complete
4. VISUAL ANCHORS: List 2-4 key items the AI should look for
5. TOOLS NEEDED: List any tools required for THIS specific step (wrench, screwdriver, pliers, etc.)
6. MATERIALS NEEDED: List any materials/parts required for THIS specific step (replacement part, tape, etc.)

STEP DESIGN RULES:
- 4-7 steps total (enough detail, not overwhelming)
- Each step = ONE distinct visual state change
- Break complex actions into sub-steps if needed
- Include "verify/test" as final step
- Safety notes required for: electrical, gas, sharp edges, hot surfaces, chemicals, heavy lifting

CRITICAL SAFETY-FIRST RULE:
- If the item involves FIRE, HEAT, ELECTRICITY, GAS, or WATER:
  * Step 1 MUST be a safety step (e.g., "Extinguish the flame", "Turn off power", "Shut off water")
  * NEVER skip directly to the repair without addressing active hazards first
- For candles: ALWAYS start with "Blow out/extinguish the candle flame" before ANY manipulation
- For electrical: ALWAYS start with "Turn off power at the breaker" before touching wires
- For plumbing: ALWAYS start with "Turn off the water supply" before disconnecting pipes

GOOD STEP EXAMPLES:
✓ "Locate the water shut-off valve" → lookingFor: "Round or lever-style valve on pipe, usually chrome or brass, near the base of the toilet"
✓ "Turn the valve clockwise to shut off water" → completionCriteria: "Valve handle is perpendicular to pipe (OFF position) or rotated fully clockwise"
✓ "Disconnect the supply line from the fill valve" → completionCriteria: "Flexible braided hose is disconnected, fill valve inlet is exposed"

BAD STEP EXAMPLES:
✗ "Fix the toilet" (too vague, no visual anchor)
✗ "Do the necessary repairs" (no completion criteria)
✗ "Make sure it's working" (not visually verifiable)`;

    // Call Gemini API with structured output
    console.log('[repair-plan] Calling Gemini 2.5 Flash API with structured output...');
    const result = await model.generateContent([{ text: promptText }]);
    console.log('[repair-plan] Gemini API call complete');
    const response = await result.response;
    const text = response.text();
    console.log('[repair-plan] Response text length:', text.length);
    console.log('[repair-plan] Response preview:', text.substring(0, 300));

    // With structured output, the response is already valid JSON matching our schema
    let plan;
    try {
      plan = JSON.parse(text);
    } catch (parseError) {
      // Fallback: try regex extraction if direct parse fails
      console.warn('[repair-plan] Direct JSON parse failed, trying regex fallback');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[repair-plan] Invalid Gemini response - no JSON found:', text.substring(0, 500));
        return errorResponse('Failed to parse AI response', 500);
      }
      plan = JSON.parse(jsonMatch[0]);
    }
    console.log('[repair-plan] Plan parsed, steps count:', plan.steps?.length);

    // Ensure all steps have required arrays (even if empty)
    if (plan.steps) {
      plan.steps = plan.steps.map((step: any) => ({
        ...step,
        toolsNeeded: step.toolsNeeded || [],
        materialsNeeded: step.materialsNeeded || [],
        visualAnchors: step.visualAnchors || [],
      }));
    }

    // Record usage (don't await to avoid latency)
    recordUsage(supabase, user.id, 'repair_plan', {
      category,
      stepsCount: plan.steps?.length || 0,
    });

    console.log('[repair-plan] Returning success response');
    // Return successful response
    return new Response(
      JSON.stringify({
        steps: plan.steps,
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

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[repair-plan] Function error:', error.message);
    console.error('[repair-plan] Error stack:', error.stack);
    console.error('[repair-plan] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    // Check for Gemini-specific errors
    const errorMessage = error.message || 'Unknown error';

    // Log detailed info for debugging
    console.error('[repair-plan] Error analysis:', {
      message: errorMessage,
      includes429: errorMessage.includes('429'),
      includesQuota: errorMessage.includes('quota'),
      includesRate: errorMessage.includes('rate'),
      includesLimit: errorMessage.includes('limit'),
      includesResource: errorMessage.includes('RESOURCE_EXHAUSTED'),
    });

    if (errorMessage.includes('SAFETY') || errorMessage.includes('blocked')) {
      return errorResponse('Content was blocked by safety filters', 400);
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return errorResponse(`Gemini API rate limit exceeded (2.5-flash). Error: ${errorMessage.substring(0, 150)}`, 429);
    }

    // Return actual error for debugging
    return errorResponse(`Failed to generate repair plan: ${errorMessage.substring(0, 150)}`, 500);
  }
});
