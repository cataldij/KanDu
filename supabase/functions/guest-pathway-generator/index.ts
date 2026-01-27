/**
 * Guest Pathway Generator Edge Function
 * Uses Gemini Vision to analyze home images and generate navigation instructions
 *
 * POST /functions/v1/guest-pathway-generator
 * Body: { kitId, zoneId? }
 * - If zoneId provided: generates pathway from home base to that zone
 * - If no zoneId: generates overview of home layout
 */

import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse, successResponse } from '../_shared/auth.ts';

interface PathwayResult {
  zoneId: string;
  zoneName: string;
  pathwayDescription: string;
  navigationSteps: string[];
  landmarks: string[];
  estimatedDistance: string;
  difficulty: 'easy' | 'moderate' | 'complex';
}

interface HomeLayoutResult {
  layoutDescription: string;
  keyLandmarks: string[];
  zones: { name: string; direction: string; description: string }[];
}

// Helper to fetch image as base64
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    return base64;
  } catch (error) {
    console.error('Failed to fetch image:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    const body = await req.json();
    const { kitId, zoneId } = body;

    if (!kitId) {
      return errorResponse('kitId is required', 400);
    }

    console.log(`[pathway-gen] Generating pathway for kit ${kitId}, zone ${zoneId || 'all'}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the kit and verify ownership
    const { data: kit, error: kitError } = await supabase
      .from('guest_kits')
      .select('*')
      .eq('id', kitId)
      .eq('user_id', user.id)
      .single();

    if (kitError || !kit) {
      return errorResponse('Kit not found or unauthorized', 404);
    }

    // Get Gemini API key
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Collect home base images
    const homeBaseImages: { url: string; angle: string; base64?: string }[] = kit.home_base_images || [];

    // Also check for single home base image
    if (kit.home_base_image_url && homeBaseImages.length === 0) {
      homeBaseImages.push({ url: kit.home_base_image_url, angle: 'front' });
    }

    console.log(`[pathway-gen] Found ${homeBaseImages.length} home base images`);

    // Fetch home base images as base64
    const homeImageParts: any[] = [];
    for (const img of homeBaseImages) {
      const base64 = await fetchImageAsBase64(img.url);
      if (base64) {
        homeImageParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        });
        console.log(`[pathway-gen] Loaded home base image (${img.angle})`);
      }
    }

    if (homeImageParts.length === 0) {
      return errorResponse('No home base images found. Please complete the kitchen scan first.', 400);
    }

    // If generating for a specific zone
    if (zoneId) {
      // Fetch zone details
      const { data: zone, error: zoneError } = await supabase
        .from('guest_kit_zones')
        .select('*')
        .eq('id', zoneId)
        .eq('kit_id', kitId)
        .single();

      if (zoneError || !zone) {
        return errorResponse('Zone not found', 404);
      }

      // Collect zone images
      const zoneImages: { url: string; angle?: string; sequence?: number }[] = [
        ...(zone.zone_images || []),
        ...(zone.pathway_images || []),
      ];

      console.log(`[pathway-gen] Found ${zoneImages.length} zone images for ${zone.name}`);

      // Fetch zone images as base64
      const zoneImageParts: any[] = [];
      for (const img of zoneImages) {
        const base64 = await fetchImageAsBase64(img.url);
        if (base64) {
          zoneImageParts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64,
            },
          });
        }
      }

      // Build prompt for zone-specific pathway
      const prompt = `You are a navigation assistant helping someone find their way through a home.

TASK: Generate clear navigation instructions from the KITCHEN (home base) to the ${zone.name} (${zone.zone_type}).

HOME BASE IMAGES (Kitchen):
The following images show the kitchen/home base area from different angles. This is the starting point.

DESTINATION IMAGES (${zone.name}):
The following images show the destination zone and/or the path to get there.

Based on analyzing these images, provide navigation instructions.

IMPORTANT:
- Use specific visual landmarks you can see in the images (appliances, doors, furniture, colors, patterns)
- Give step-by-step directions
- Include helpful orientation cues ("you should see X on your left")
- Estimate approximate distance or number of steps if possible
- Note any potential hazards or tricky spots

OUTPUT (JSON only):
{
  "pathwayDescription": "A 2-3 sentence overview of the route",
  "navigationSteps": [
    "Step 1: From the kitchen, ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "landmarks": ["List of key landmarks to look for along the way"],
  "estimatedDistance": "Approximate distance (e.g., '20 feet', '15 steps')",
  "difficulty": "easy|moderate|complex"
}`;

      // Combine all image parts
      const allImageParts = [...homeImageParts, ...zoneImageParts];

      console.log(`[pathway-gen] Sending ${allImageParts.length} images to Gemini`);

      // Call Gemini
      const result = await model.generateContent([
        prompt,
        ...allImageParts,
      ]);

      const responseText = result.response.text();
      console.log('[pathway-gen] Gemini response received');

      // Parse response
      let pathwayData: any;
      try {
        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          pathwayData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[pathway-gen] Failed to parse Gemini response:', responseText);
        return errorResponse('Failed to parse AI response', 500);
      }

      // Update zone with generated pathway
      const { error: updateError } = await supabase
        .from('guest_kit_zones')
        .update({
          pathway_description: pathwayData.pathwayDescription,
          pathway_complete: true,
        })
        .eq('id', zoneId);

      if (updateError) {
        console.error('[pathway-gen] Failed to save pathway:', updateError);
      }

      const pathwayResult: PathwayResult = {
        zoneId: zoneId,
        zoneName: zone.name,
        pathwayDescription: pathwayData.pathwayDescription,
        navigationSteps: pathwayData.navigationSteps || [],
        landmarks: pathwayData.landmarks || [],
        estimatedDistance: pathwayData.estimatedDistance || 'Unknown',
        difficulty: pathwayData.difficulty || 'moderate',
      };

      return successResponse({ pathway: pathwayResult });

    } else {
      // Generate overview of home layout
      const prompt = `You are a navigation assistant analyzing a home layout.

TASK: Analyze these images of the kitchen/home base area and describe the overall layout.

These images show the kitchen from multiple angles. Based on what you can see:
1. Describe the kitchen layout
2. Identify exits/doorways visible and where they likely lead
3. Note key landmarks that could help with navigation
4. Suggest the likely locations of common rooms (bathroom, bedrooms, etc.)

OUTPUT (JSON only):
{
  "layoutDescription": "A 2-3 sentence description of the kitchen and visible exits",
  "keyLandmarks": ["List of prominent landmarks visible"],
  "zones": [
    {"name": "Likely room name", "direction": "Which way from kitchen", "description": "What you can see leading there"}
  ]
}`;

      console.log(`[pathway-gen] Sending ${homeImageParts.length} images for home layout analysis`);

      const result = await model.generateContent([
        prompt,
        ...homeImageParts,
      ]);

      const responseText = result.response.text();
      console.log('[pathway-gen] Gemini home layout response received');

      // Parse response
      let layoutData: HomeLayoutResult;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          layoutData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[pathway-gen] Failed to parse layout response:', responseText);
        return errorResponse('Failed to parse AI response', 500);
      }

      // Update kit with home base description
      const { error: updateError } = await supabase
        .from('guest_kits')
        .update({
          home_base_description: layoutData.layoutDescription,
        })
        .eq('id', kitId);

      if (updateError) {
        console.error('[pathway-gen] Failed to save layout:', updateError);
      }

      return successResponse({ layout: layoutData });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[pathway-gen] Error:', error.message);
    return errorResponse(error.message || 'Internal server error', 500);
  }
});
