/**
 * Guided Fix Edge Function
 * Real-time camera guidance using Gemini API
 *
 * POST /functions/v1/guided-fix
 * Body: { imageBase64, category, problemDescription, currentStep, totalSteps, currentStepInstruction, ... }
 * Returns: GuidanceResponse object
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateGuidedFixRequest } from '../_shared/validation.ts';

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
    const validation = validateGuidedFixRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400);
    }

    // TEMPORARILY BYPASSED FOR TESTING - TODO: Re-enable rate limiting
    // Check rate limit (high limit for real-time guidance)
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS.GUIDED_FIX
    );

    // Bypass rate limit for testing - just log it
    console.log(`[guided-fix] Rate limit check: allowed=${rateLimitResult.allowed}, remaining=${rateLimitResult.remaining}, count=${rateLimitResult.currentCount}`);

    // if (!rateLimitResult.allowed) {
    //   return new Response(
    //     JSON.stringify({
    //       error: 'Hourly guidance limit reached. Please wait before continuing.',
    //       remaining: 0,
    //       resetAt: rateLimitResult.resetAt.toISOString(),
    //     }),
    //     {
    //       status: 429,
    //       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    //     }
    //   );
    // }

    // Get Gemini API key from environment
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini with Flash model for speed - using gemini-2.0-flash for higher quota limits
    // Using structured output (JSON schema) to GUARANTEE consistent response format
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Define the exact JSON schema we require - this FORCES Gemini to return this structure
    const guidanceSchema = {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Actionable guidance for the user - what to DO next"
        },
        detectedObject: {
          type: "string",
          description: "What object/item is visible in the frame",
          nullable: true
        },
        confidence: {
          type: "number",
          description: "Confidence score 0.0-1.0 for step completion"
        },
        stepComplete: {
          type: "boolean",
          description: "Whether the current step appears to be complete"
        },
        suggestCompletion: {
          type: "boolean",
          description: "Whether to ask user to confirm step completion (for medium confidence)"
        },
        completionEvidence: {
          type: "string",
          description: "What visual evidence indicates the step is complete",
          nullable: true
        },
        safetyWarning: {
          type: "string",
          description: "Any safety concerns that should stop the session",
          nullable: true
        },
        shouldStop: {
          type: "boolean",
          description: "Whether to immediately stop due to safety concerns"
        },
        wrongItem: {
          type: "boolean",
          description: "Whether the detected item doesn't match expected item"
        },
        detectedItemMismatch: {
          type: "string",
          description: "What item was detected if it doesn't match expected",
          nullable: true
        },
        requiresManualAction: {
          type: "boolean",
          description: "TRUE when instruction requires physical action (turn, press, cut, blow, etc.) - user needs hands-free time to complete"
        },
        highlights: {
          type: "array",
          description: "REQUIRED: Bounding boxes for detected objects. MUST include at least one highlight.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Label for the highlighted object"
              },
              x: {
                type: "number",
                description: "X position as percentage (0-100) from left edge"
              },
              y: {
                type: "number",
                description: "Y position as percentage (0-100) from top edge"
              },
              width: {
                type: "number",
                description: "Width as percentage (0-100) of image width"
              },
              height: {
                type: "number",
                description: "Height as percentage (0-100) of image height"
              }
            },
            required: ["label", "x", "y", "width", "height"]
          }
        }
      },
      required: ["instruction", "confidence", "stepComplete", "suggestCompletion", "shouldStop", "wrongItem", "requiresManualAction", "highlights"]
    };

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: guidanceSchema,
      },
    });

    const {
      imageBase64,
      category,
      problemDescription,
      currentStep,
      totalSteps,
      currentStepInstruction,
      stepContext,
      expectedItem,
      originalImageBase64,
      completionCriteria,
      visualAnchors,
      userConstraints,
      bannedItems, // Items user has marked as unavailable - NEVER mention these
      confirmedSubstitutes // Map of original item -> substitute item (e.g., {"aluminum foil": "wax paper"})
    } = body;

    // Build the prompt - Optimized for accurate step completion detection and visual highlights
    const promptText = `REPAIR GUIDANCE - Step ${currentStep}/${totalSteps}

You are a real-time repair assistant. Analyze the camera frame and GUIDE the user through the current step.

=== CONTEXT ===
Category: ${category}
Problem: ${problemDescription}
${expectedItem ? `Target Item: ${expectedItem}` : ''}
${bannedItems && Array.isArray(bannedItems) && bannedItems.length > 0 ? `
=== ⛔ BANNED ITEMS (NEVER MENTION) ===
The user does NOT have these items. NEVER mention, suggest, or reference them:
${bannedItems.map((item: string) => `- ${item}`).join('\n')}

You MUST NOT:
- Suggest using any banned item
- Ask if they have a banned item
- Include banned items in any instruction
- Reference banned items even indirectly
Find ALTERNATIVES or different approaches instead.
` : ''}${confirmedSubstitutes && typeof confirmedSubstitutes === 'object' && Object.keys(confirmedSubstitutes).length > 0 ? `
=== ✅ CONFIRMED SUBSTITUTES (USE THESE) ===
The user has CONFIRMED they have these substitute items. Use these INSTEAD of the original items:
${Object.entries(confirmedSubstitutes).map(([original, substitute]) => `- Use "${substitute}" instead of "${original}"`).join('\n')}

IMPORTANT: When referring to these items, use the SUBSTITUTE name, not the original.
For example, if using wax paper instead of aluminum foil, say "the wax paper" not "the aluminum foil".
` : ''}${userConstraints ? `\n=== USER CONSTRAINTS ===\nThe user has indicated: ${userConstraints}\nADAPT your guidance accordingly.` : ''}

=== CURRENT STEP ===
"${currentStepInstruction}"
${stepContext ? `Looking for: ${stepContext}` : ''}
${completionCriteria ? `Done when: ${completionCriteria}` : ''}

=== CRITICAL: DO NOT JUST IDENTIFY - GUIDE! ===
WRONG: "I can see the candle" or "Got it, I see the candle" (identification only)
RIGHT: "Now blow out the flame" or "The flame is still lit - blow it out" (actionable guidance)

Your job is to GUIDE, not just acknowledge what you see. Every response must tell the user what to DO next, or confirm the step is COMPLETE.

=== YOUR TASK ===
1. Identify relevant objects in frame and provide VISUAL HIGHLIGHTS (see below)
2. If step is NOT complete: Give specific ACTION guidance ("Now do X", "Turn the Y", "Move closer to Z")
3. If step IS complete: Confirm completion and set stepComplete=true
4. If giving a PHYSICAL ACTION instruction, set requiresManualAction=true

=== MANUAL ACTION FLAG (CRITICAL) ===
Set requiresManualAction=true when your instruction requires the user to:
- Use their hands (turn, press, pull, push, twist, squeeze, hold)
- Perform a physical task (cut, blow, wipe, pour, apply, wrap, cover)
- Manipulate objects (remove, attach, disconnect, plug, unplug)
- Use tools (tighten, loosen, screw, unscrew)

Set requiresManualAction=false when:
- Just asking to move/point the camera
- Confirming step completion
- Giving observation-only feedback

This flag pauses the session so the user can work hands-free.

=== VISUAL HIGHLIGHTS (REQUIRED - DETECT ALL OBJECTS) ===
You MUST provide bounding boxes for ALL relevant objects visible in the frame - not just the primary target.
Coordinates are percentages (0-100) of image dimensions (top-left is 0,0).

HIGHLIGHT THESE:
1. PRIMARY TARGET: The main object for the current step (label it clearly, e.g., "P-trap", "Candle flame")
2. TOOLS: Any visible tools (wrench, screwdriver, pliers, bucket, etc.)
3. RELATED COMPONENTS: Other parts of the repair area (pipes, valves, wires, screws)
4. OBSTRUCTIONS: Objects that might be in the way of completing the step
5. HANDS: If user's hands are visible, highlight them

Example - Plumbing repair with multiple objects:
[
  {"label": "P-trap (target)", "x": 30, "y": 50, "width": 25, "height": 30},
  {"label": "Wrench", "x": 60, "y": 70, "width": 15, "height": 10},
  {"label": "Bucket", "x": 10, "y": 60, "width": 20, "height": 25},
  {"label": "Water shut-off valve", "x": 70, "y": 40, "width": 12, "height": 15}
]

IMPORTANT: Include 2-5 highlights per frame. More context helps the user understand what they're looking at.

=== STEP COMPLETION LOGIC ===
Be GENEROUS with step completion. Users are doing the work - you confirm.

For STATE-CHANGE steps (turn off, extinguish, remove, disconnect):
- If the BEFORE state is no longer visible, mark stepComplete=true
- "Extinguish the candle" → No flame visible = COMPLETE
- "Turn off the water" → No water flowing = COMPLETE

For LOCATION steps (find, locate, identify):
- If the target item is visible in frame, mark stepComplete=true
- "Locate the P-trap" → P-trap visible = COMPLETE

For ACTION steps (turn, press, adjust):
- If the result of the action is visible, mark stepComplete=true
- "Turn valve clockwise" → Valve in off position = COMPLETE

=== CONFIDENCE LEVELS ===
- 0.7+ with stepComplete=true → Auto-advance to next step
- 0.5-0.69 → Set suggestCompletion=true (ask user to confirm)
- 0.3-0.49 → Keep guiding
- Below 0.3 → Item may be out of view or not visible

IMPORTANT: Be GENEROUS with confidence scores. If the step appears done, use 0.75+ confidence.

=== ITEM NOT VISIBLE ===
If you cannot see the expected item in the frame:
- Set confidence below 0.3
- Set detectedObject to what you DO see (if anything)
- Give instruction: "Move camera to show [expected item]"
- Do NOT mark stepComplete as true

=== OUTPUT (JSON ONLY) ===
Return ONLY valid JSON. No markdown, no explanation. Example:
{"instruction":"Blow out the flame now","detectedObject":"Candle with flame","confidence":0.85,"stepComplete":false,"suggestCompletion":false,"completionEvidence":null,"safetyWarning":null,"shouldStop":false,"wrongItem":false,"detectedItemMismatch":null,"requiresManualAction":true,"highlights":[{"label":"Candle flame","x":45,"y":30,"width":15,"height":20}]}

Remember: GUIDE, don't just identify. Every instruction must be ACTIONABLE or confirm COMPLETION.`;

    // Build content parts
    const contentParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: promptText },
      { text: "CURRENT CAMERA VIEW:" },
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg',
        },
      },
    ];

    // Add original reference image if available
    if (originalImageBase64) {
      contentParts.push(
        { text: "ORIGINAL REFERENCE IMAGE (from diagnosis):" },
        {
          inlineData: {
            data: originalImageBase64,
            mimeType: 'image/jpeg',
          },
        }
      );
    }

    // Call Gemini API with structured output - response is guaranteed to match schema
    console.log('[guided-fix] Calling Gemini API with structured output...');
    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();
    console.log('[guided-fix] Gemini structured response (first 500 chars):', text.substring(0, 500));

    // With structured output, the response is already valid JSON matching our schema
    // No regex matching needed - just parse directly
    let guidance;
    try {
      guidance = JSON.parse(text);
    } catch (parseError) {
      // Fallback: try regex extraction if direct parse fails (shouldn't happen with structured output)
      console.warn('[guided-fix] Direct JSON parse failed, trying regex fallback');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[guided-fix] Invalid Gemini response - no JSON found:', text.substring(0, 500));
        return errorResponse('Failed to parse AI response', 500);
      }
      guidance = JSON.parse(jsonMatch[0]);
    }

    console.log('[guided-fix] Parsed guidance:', JSON.stringify(guidance).substring(0, 300));
    console.log('[guided-fix] Highlights count:', guidance.highlights?.length || 0);

    // Validate that highlights exist (should always be present due to schema)
    if (!guidance.highlights || guidance.highlights.length === 0) {
      console.warn('[guided-fix] No highlights returned despite schema requirement - adding fallback');
      // Add a fallback highlight centered in frame if none provided
      guidance.highlights = [{
        label: guidance.detectedObject || 'Target area',
        x: 35,
        y: 35,
        width: 30,
        height: 30
      }];
    }

    // Record usage (don't await to avoid latency)
    recordUsage(supabase, user.id, 'guided_fix', {
      category,
      currentStep,
      totalSteps,
    });

    // Build final response
    const finalResponse = {
      ...guidance,
      _meta: {
        remaining: rateLimitResult.remaining - 1,
      },
    };
    console.log('[guided-fix] Returning response:', JSON.stringify(finalResponse).substring(0, 500));

    // Return successful response
    return new Response(
      JSON.stringify(finalResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[guided-fix] Function error:', error.message);
    console.error('[guided-fix] Error stack:', error.stack);
    console.error('[guided-fix] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    // Check for Gemini-specific errors
    const errorMessage = error.message || 'Unknown error';

    // Log detailed info for debugging
    console.error('[guided-fix] Error analysis:', {
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

    return errorResponse(`Failed to analyze frame: ${errorMessage.substring(0, 150)}`, 500);
  }
});
