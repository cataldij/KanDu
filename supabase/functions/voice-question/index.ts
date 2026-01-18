/**
 * Voice Question Edge Function
 * Handles voice questions during guided repair sessions
 *
 * POST /functions/v1/voice-question
 * Body: { question, category, diagnosisSummary, currentStepInstruction, identityStatus, imageBase64? }
 * Returns: { answer: string }
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';
import { checkRateLimit, recordUsage, RATE_LIMITS } from '../_shared/rate-limit.ts';

interface VoiceQuestionRequest {
  question: string;
  category: string;
  diagnosisSummary: string;
  currentStepInstruction: string;
  identityStatus: 'CONFIRMED' | 'MISMATCH' | 'CHECKING' | 'UNKNOWN';
  imageBase64?: string;
  conversationContext?: string; // Recent Q&A history
  userConstraints?: string; // User's tool/material constraints
}

function validateVoiceQuestionRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { question, category, diagnosisSummary, currentStepInstruction, identityStatus } = body as Record<string, unknown>;

  if (!question || typeof question !== 'string') {
    return { valid: false, error: 'Question is required' };
  }

  if (question.length > 500) {
    return { valid: false, error: 'Question too long. Maximum 500 characters.' };
  }

  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  if (!diagnosisSummary || typeof diagnosisSummary !== 'string') {
    return { valid: false, error: 'Diagnosis summary is required' };
  }

  if (!currentStepInstruction || typeof currentStepInstruction !== 'string') {
    return { valid: false, error: 'Current step instruction is required' };
  }

  const validStatuses = ['CONFIRMED', 'MISMATCH', 'CHECKING', 'UNKNOWN'];
  if (!identityStatus || !validStatuses.includes(identityStatus as string)) {
    return { valid: false, error: 'Valid identity status is required' };
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
    // Verify authentication
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = validateVoiceQuestionRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400);
    }

    // TEMPORARILY BYPASSED FOR TESTING - TODO: Re-enable rate limiting
    // Use guided_fix rate limit since voice questions are part of guided fix
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS.GUIDED_FIX
    );

    // Bypass rate limit for testing - just log it
    console.log(`[voice-question] Rate limit check: allowed=${rateLimitResult.allowed}, remaining=${rateLimitResult.remaining}, count=${rateLimitResult.currentCount}`);

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
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.5, // Slightly higher for more creative alternatives
        maxOutputTokens: 150, // Allow longer responses for alternatives
      }
    });

    const {
      question,
      category,
      diagnosisSummary,
      currentStepInstruction,
      identityStatus,
      imageBase64,
      conversationContext,
      userConstraints
    } = body as VoiceQuestionRequest;

    // Determine safety state
    const safetyState = identityStatus === 'CONFIRMED' ? 'SAFE' :
                        identityStatus === 'MISMATCH' ? 'DANGER' : 'UNKNOWN';

    // Detect if user is asking about alternatives/substitutions
    const lowerQuestion = question.toLowerCase();
    const isAskingAlternative = lowerQuestion.includes("don't have") ||
                                lowerQuestion.includes("dont have") ||
                                lowerQuestion.includes("what if") ||
                                lowerQuestion.includes("instead") ||
                                lowerQuestion.includes("alternative") ||
                                lowerQuestion.includes("without") ||
                                lowerQuestion.includes("substitute") ||
                                lowerQuestion.includes("no ") || // "I have no X"
                                lowerQuestion.includes("can i use") ||
                                lowerQuestion.includes("can't find");

    console.log(`[voice-question] Question: "${question}", isAskingAlternative: ${isAskingAlternative}`);

    // Build the prompt - adaptive based on question type
    let promptText: string;

    if (isAskingAlternative) {
      // User is asking about alternatives - provide helpful substitution advice
      promptText = `You are a helpful repair assistant. The user is working on: ${category} - ${diagnosisSummary}

Current step: "${currentStepInstruction}"
${userConstraints ? `User constraints: ${userConstraints}` : ''}
${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}

User asked: "${question}"

The user is asking about an ALTERNATIVE or SUBSTITUTION. Be HELPFUL and ADAPTIVE:
- If they don't have a specific tool/item, suggest practical alternatives
- For heat sources: suggest alternatives like warm water, sunlight, or skipping the step
- For tools: suggest household alternatives
- Provide a MODIFIED instruction that works with what they have
- Keep response under 50 words
- Be encouraging and solution-focused

Respond with a practical alternative approach.`;
    } else {
      // Standard question about the current step
      promptText = `You are a repair assistant helping with this step: "${currentStepInstruction}"

The user is working on: ${category} - ${diagnosisSummary}
${userConstraints ? `User constraints: ${userConstraints}` : ''}
${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}

User asked: "${question}"

RULES:
- Answer the user's question helpfully
- Consider any user constraints mentioned above
- Keep response under 30 words
- Be helpful and solution-focused
- If the question seems to be about safety, warn appropriately

Respond clearly in 1-2 sentences max.`;
    }

    // Build content parts
    const contentParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: promptText }
    ];

    // Add image if provided
    if (imageBase64) {
      contentParts.push({
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg',
        },
      });
    }

    // Call Gemini API
    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const answer = response.text() || 'Sorry, I could not process that question. Please try again.';

    // Record usage (don't await to avoid latency)
    recordUsage(supabase, user.id, 'voice_question', {
      category,
      questionLength: question.length,
    });

    // Return successful response
    return new Response(
      JSON.stringify({
        answer: answer.trim(),
        _meta: {
          remaining: rateLimitResult.remaining - 1,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Voice question function error:', err);

    if (err instanceof SyntaxError) {
      return errorResponse('Invalid request format', 400);
    }

    return errorResponse('Failed to process question', 500);
  }
});
