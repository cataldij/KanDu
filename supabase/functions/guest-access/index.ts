/**
 * Guest Access Edge Function
 * Allows unauthenticated guests to access shared guest kits
 *
 * POST /functions/v1/guest-access
 *   - action: 'get-kit' - Get kit by slug (for guests)
 *   - action: 'verify-pin' - Verify access PIN
 *   - action: 'log-access' - Log access for analytics
 *   - action: 'scan-navigate' - AI-powered navigation assistance
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/auth.ts';

interface ScanRequest {
  kitId: string;
  itemId: string;
  imageBase64: string;
  currentStep?: number;
}

interface NavigationResponse {
  location_identified: string;
  guest_facing_angle?: number; // 0, 45, 90, 135, 180, 225, 270, 315
  destination_angle?: number;  // 0, 45, 90, 135, 180, 225, 270, 315
  facing_direction?: 'front' | 'right' | 'back' | 'left' | 'exit' | null;
  confidence: number;
  next_instruction: string;
  // Direction arrow for AR floor guidance
  move_direction?: 'forward' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'back' | 'arrived' | null;
  highlight?: {
    description: string;
    region?: { x: number; y: number; width: number; height: number };
  };
  warning?: string;
  arrived: boolean;
  step_number: number;
  total_steps: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      // ============================================
      // GET KIT BY SLUG (Public access)
      // ============================================
      case 'get-kit': {
        const { slug, pin } = body as { slug: string; pin?: string };

        if (!slug) {
          return errorResponse('slug is required', 400);
        }

        // Get the kit by slug
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (kitError || !kit) {
          console.error('Kit not found:', kitError);
          return errorResponse('Guest kit not found or inactive', 404);
        }

        // Check expiration
        if (kit.expires_at && new Date(kit.expires_at) < new Date()) {
          return errorResponse('This guest link has expired', 410);
        }

        // Check PIN if required
        if (kit.access_pin && kit.access_pin !== pin) {
          return successResponse({
            requiresPin: true,
            kitName: kit.display_name,
          });
        }

        // Get items for this kit
        const { data: items, error: itemsError } = await supabase
          .from('guest_kit_items')
          .select('*')
          .eq('kit_id', kit.id)
          .order('priority', { ascending: true })
          .order('display_order', { ascending: true });

        if (itemsError) {
          console.error('Items fetch error:', itemsError);
        }

        // Sanitize kit data for guest view
        const guestKit = {
          id: kit.id,
          display_name: kit.display_name,
          kit_type: kit.kit_type,
          homeowner_name: kit.homeowner_name,
          homeowner_phone: kit.show_phone_to_guest ? kit.homeowner_phone : null,
          home_base_image_url: kit.home_base_image_url,
          home_base_images: kit.home_base_images || [], // Multi-angle kitchen scan
          home_base_scan_complete: kit.home_base_scan_complete || false,
          home_base_description: kit.home_base_description,
          wifi_network: kit.wifi_network,
          wifi_password: kit.wifi_password,
          address: kit.show_address ? kit.address : null,
          checkin_time: kit.checkin_time,
          checkout_time: kit.checkout_time,
          checkin_instructions: kit.checkin_instructions,
          checkout_instructions: kit.checkout_instructions,
          house_rules: kit.house_rules,
        };

        // Log access
        await supabase.from('guest_kit_access_logs').insert({
          kit_id: kit.id,
          user_agent: req.headers.get('user-agent') || 'unknown',
          items_viewed: [],
          scans_performed: 0,
        });

        return successResponse({
          kit: guestKit,
          items: items || [],
          requiresPin: false,
        });
      }

      // ============================================
      // VERIFY PIN
      // ============================================
      case 'verify-pin': {
        const { slug, pin } = body as { slug: string; pin: string };

        if (!slug || !pin) {
          return errorResponse('slug and pin are required', 400);
        }

        const { data: kit, error } = await supabase
          .from('guest_kits')
          .select('id, access_pin')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (error || !kit) {
          return errorResponse('Guest kit not found', 404);
        }

        if (kit.access_pin !== pin) {
          return errorResponse('Invalid PIN', 401);
        }

        return successResponse({ verified: true });
      }

      // ============================================
      // LOG ITEM VIEW
      // ============================================
      case 'log-view': {
        const { kitId, itemId } = body as { kitId: string; itemId: string };

        if (!kitId || !itemId) {
          return errorResponse('kitId and itemId are required', 400);
        }

        // Update the most recent access log for this kit
        const { data: recentLog } = await supabase
          .from('guest_kit_access_logs')
          .select('id, items_viewed')
          .eq('kit_id', kitId)
          .order('accessed_at', { ascending: false })
          .limit(1)
          .single();

        if (recentLog) {
          const itemsViewed = recentLog.items_viewed || [];
          if (!itemsViewed.includes(itemId)) {
            itemsViewed.push(itemId);
            await supabase
              .from('guest_kit_access_logs')
              .update({ items_viewed: itemsViewed })
              .eq('id', recentLog.id);
          }
        }

        return successResponse({ logged: true });
      }

      // ============================================
      // AI SCAN NAVIGATION (Zone-based)
      // ============================================
      case 'scan-navigate': {
        const { kitId, itemId, imageBase64, currentStep } = body as ScanRequest;

        if (!kitId || !itemId || !imageBase64) {
          return errorResponse('kitId, itemId, and imageBase64 are required', 400);
        }

        // Get the kit and item
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('*')
          .eq('id', kitId)
          .eq('is_active', true)
          .single();

        if (kitError || !kit) {
          return errorResponse('Kit not found', 404);
        }

        const { data: item, error: itemError } = await supabase
          .from('guest_kit_items')
          .select('*')
          .eq('id', itemId)
          .single();

        if (itemError || !item) {
          return errorResponse('Item not found', 404);
        }

        // Get zone for this item (if assigned)
        let zone = null;
        if (item.zone_id) {
          const { data: zoneData } = await supabase
            .from('guest_kit_zones')
            .select('*')
            .eq('id', item.zone_id)
            .single();
          zone = zoneData;
        }

        // Initialize Gemini
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        if (!GEMINI_API_KEY) {
          return errorResponse('AI service not configured', 500);
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Build the navigation context
        const itemName = item.custom_name || getItemTypeName(item.item_type);
        const homeBaseImages = kit.home_base_images || [];
        const hasKitchenScan = homeBaseImages.length > 0;

        // Debug logging for kitchen scan
        console.log(`[scan-navigate] Kit ID: ${kitId}`);
        console.log(`[scan-navigate] home_base_images count: ${homeBaseImages.length}`);
        console.log(`[scan-navigate] home_base_scan_complete: ${kit.home_base_scan_complete}`);
        if (homeBaseImages.length > 0) {
          console.log(`[scan-navigate] First image angle: ${homeBaseImages[0]?.angle}, url: ${homeBaseImages[0]?.url?.substring(0, 60)}...`);
        } else {
          console.log(`[scan-navigate] WARNING: No kitchen reference images found!`);
        }

        // Zone-based navigation data
        const pathwayImages = zone?.pathway_images || [];
        const zoneImages = zone?.zone_images || [];
        const hasPathway = pathwayImages.length > 0;
        const hasZoneScan = zoneImages.length > 0;

        // Calculate total steps: Kitchen + Pathway waypoints + Zone + Item destination
        const totalSteps = 1 + pathwayImages.length + (hasZoneScan ? 1 : 0) + 1;

        // Build comprehensive navigation context
        let routeContext = `
NAVIGATION ROUTE:
1. START: Kitchen (Home Base)`;

        if (hasPathway) {
          pathwayImages.forEach((wp: { sequence: number; label: string; description?: string }, i: number) => {
            routeContext += `\n${i + 2}. WAYPOINT: ${wp.label}${wp.description ? ` - ${wp.description}` : ''}`;
          });
        }

        if (zone) {
          routeContext += `\n${pathwayImages.length + 2}. ZONE: ${zone.name}${zone.zone_description ? ` - ${zone.zone_description}` : ''}`;
        }

        routeContext += `\n${totalSteps}. DESTINATION: ${itemName}${item.hint ? ` - ${item.hint}` : ''}`;

        // Build kitchen context
        let kitchenContext = '';
        if (hasKitchenScan) {
          const angleDescriptions = homeBaseImages.map((img: { angle: string; description?: string }) => {
            const angleName = img.angle === 'front' ? 'FRONT (0°)' :
                             img.angle === 'front_right' ? 'FRONT-RIGHT (45°)' :
                             img.angle === 'right' ? 'RIGHT (90°)' :
                             img.angle === 'back_right' ? 'BACK-RIGHT (135°)' :
                             img.angle === 'back' ? 'BACK (180°)' :
                             img.angle === 'back_left' ? 'BACK-LEFT (225°)' :
                             img.angle === 'left' ? 'LEFT (270°)' :
                             img.angle === 'front_left' ? 'FRONT-LEFT (315°)' :
                             img.angle === 'exit' ? 'EXIT DOORWAY' : img.angle;
            return `  - ${angleName}`;
          }).join('\n');
          kitchenContext = `\n\nKITCHEN (START POINT) - 360° Reference (8 compass angles + exit):\n${angleDescriptions}`;
        }

        // Build pathway context
        let pathwayContext = '';
        if (hasPathway) {
          const waypointList = pathwayImages.map((wp: { sequence: number; label: string }) =>
            `  ${wp.sequence}. ${wp.label}`
          ).join('\n');
          pathwayContext = `\n\nPATHWAY WAYPOINTS:\n${waypointList}`;
        }

        // Build zone context
        let zoneContext = '';
        if (zone && hasZoneScan) {
          const zoneAngles = zoneImages.map((img: { angle: string }) => img.angle.toUpperCase()).join(', ');
          zoneContext = `\n\n${zone.name.toUpperCase()} ZONE - 360° Reference:\nAngles available: ${zoneAngles}`;
        }

        const prompt = `You are an AI navigation assistant helping a guest find the ${itemName} in someone's home.
${routeContext}${kitchenContext}${pathwayContext}${zoneContext}

SPATIAL REASONING - CRITICAL:
The 8 kitchen reference images form a 360° panorama from the CENTER of the kitchen:
  FRONT (0°) → FRONT-RIGHT (45°) → RIGHT (90°) → BACK-RIGHT (135°) →
  BACK (180°) → BACK-LEFT (225°) → LEFT (270°) → FRONT-LEFT (315°) → back to FRONT

To navigate the guest:
1. MATCH GUEST'S VIEW: Compare the guest's current camera view to the kitchen reference images. Identify which angle (0°, 45°, 90°, etc.) they are currently facing by matching visual features (counters, appliances, windows, doorways).

2. FIND DESTINATION ANGLE: Look at ALL kitchen reference images. Which angle shows the ${itemName} or the path to it? The item may be visible on a wall, counter, or area captured in one of the 8 angles.

3. CALCULATE TURN: Based on the angle difference between where the guest IS facing vs where they NEED to face:
   - 0° difference = "forward" (already facing the right direction)
   - 45° clockwise = "slight_right"
   - 45° counter-clockwise = "slight_left"
   - 90° clockwise = "right"
   - 90° counter-clockwise = "left"
   - 135-180° difference = "back" (turn around)

IMPORTANT: If the ${itemName} is IN THE KITCHEN (visible in one of the kitchen reference angles), you should guide the guest to TURN WITHIN THE KITCHEN to face it - do NOT send them to another room unless the route specifically requires it.

CURRENT STATUS:
- Navigation step ${currentStep || 1} of ${totalSteps}

I'm providing reference images in this order:
${hasKitchenScan ? `1. Kitchen 360° scan (${homeBaseImages.length} angles - every 45°)\n` : ''}${hasPathway ? `2. Pathway waypoints (${pathwayImages.length} images)\n` : ''}${hasZoneScan ? `3. ${zone?.name} zone 360° scan (4 angles)\n` : ''}4. Guest's current camera view (ANALYZE THIS)

The kitchen scan provides comprehensive 360° coverage at 45° intervals, so you should be able to match the guest's view to one or more reference angles.

TASK:
Analyze the guest's current camera view against the reference images to determine:
1. WHERE they are on the route (kitchen, which waypoint, zone, or destination)
2. Which ANGLE they're facing (match to nearest kitchen reference: 0°, 45°, 90°, 135°, 180°, 225°, 270°, or 315°)
3. Which ANGLE shows the ${itemName} or the path to it
4. NEXT INSTRUCTION: Calculate the turn needed based on angle difference
5. If they've ARRIVED at the ${itemName}

Respond with JSON only:
{
  "location_identified": "kitchen" | "waypoint_1" | "waypoint_2" | ... | "zone" | "destination" | "unknown",
  "location_name": "Human-readable location name",
  "guest_facing_angle": 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 (which kitchen reference angle matches the guest's current view),
  "destination_angle": 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 (which kitchen reference angle shows the ${itemName} or path to it),
  "facing_direction": "front" | "right" | "back" | "left" | null,
  "confidence": 0.0-1.0,
  "route_progress": "on_track" | "ahead" | "behind" | "lost",
  "next_instruction": "Clear, specific instruction for what to do next",
  "move_direction": "forward" | "left" | "right" | "slight_left" | "slight_right" | "back" | "arrived",
  "highlight": {
    "description": "What visual landmark to look for or what the user should see",
    "region": {
      "x": 0.0-1.0 (normalized horizontal center position in camera view, 0=left edge, 1=right edge),
      "y": 0.0-1.0 (normalized vertical center position in camera view, 0=top, 1=bottom),
      "width": 0.0-1.0 (normalized width of highlight box),
      "height": 0.0-1.0 (normalized height of highlight box)
    }
  },
  "warning": null or "Safety warning if applicable",
  "arrived": true/false,
  "step_number": ${currentStep || 1},
  "total_steps": ${totalSteps}
}

IMPORTANT for "move_direction":
- This controls an AR arrow shown on the floor of the camera view
- "forward" = walk straight ahead in the direction they're facing
- "left" = turn left (90°) then walk
- "right" = turn right (90°) then walk
- "slight_left" = turn slightly left (45°) then walk
- "slight_right" = turn slightly right (45°) then walk
- "back" = turn around (180°) and walk
- "arrived" = they've reached the destination, no arrow needed

IMPORTANT for "highlight.region":
- If you can identify the target item (${itemName}) or a relevant landmark in the guest's current camera view, provide the REGION coordinates where it appears.
- Coordinates are NORMALIZED (0.0 to 1.0) relative to the image dimensions.
- For example, if the fire extinguisher is visible in the center-right of the image: x=0.7, y=0.5, width=0.15, height=0.25
- If you cannot identify a specific region to highlight, omit the "region" field but still provide "description".`;

        try {
          // Create image part from guest's current camera view
          const guestImagePart = {
            inlineData: {
              data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              mimeType: 'image/jpeg',
            },
          };

          // Build content array with prompt and all reference images
          const contentParts: Array<string | { inlineData: { data: string; mimeType: string } }> = [prompt];

          // Helper to fetch and convert image to base64 (returns null on failure)
          const fetchImageAsBase64 = async (url: string, label: string): Promise<{ base64: string; label: string } | null> => {
            try {
              const imgResponse = await fetch(url);
              if (imgResponse.ok) {
                const imgBuffer = await imgResponse.arrayBuffer();
                // Use chunked approach to avoid stack overflow with large images
                const bytes = new Uint8Array(imgBuffer);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                  const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                  binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
                }
                const base64 = btoa(binary);
                console.log(`[scan-navigate] Fetched: ${label} (${bytes.length} bytes)`);
                return { base64, label };
              }
            } catch (e) {
              console.log(`Could not fetch image: ${label}`, e);
            }
            return null;
          };

          // PARALLEL FETCH: Gather all image fetch promises
          console.log(`[scan-navigate] Starting parallel fetch of all reference images...`);
          const fetchStart = Date.now();

          const kitchenFetches = hasKitchenScan
            ? homeBaseImages.filter((img: { url?: string }) => img.url).map((img: { url: string; angle: string }) =>
                fetchImageAsBase64(img.url, `Kitchen ${img.angle.toUpperCase()}`)
              )
            : [];

          const pathwayFetches = hasPathway
            ? pathwayImages.filter((wp: { url?: string }) => wp.url).map((wp: { url: string; sequence: number; label: string }) =>
                fetchImageAsBase64(wp.url, `Waypoint ${wp.sequence}: ${wp.label}`)
              )
            : [];

          const zoneFetches = (zone && hasZoneScan)
            ? zoneImages.filter((img: { url?: string }) => img.url).map((img: { url: string; angle: string }) =>
                fetchImageAsBase64(img.url, `${zone.name} ${img.angle.toUpperCase()}`)
              )
            : [];

          // Fetch ALL images in parallel
          const [kitchenResults, pathwayResults, zoneResults] = await Promise.all([
            Promise.all(kitchenFetches),
            Promise.all(pathwayFetches),
            Promise.all(zoneFetches),
          ]);

          console.log(`[scan-navigate] Parallel fetch complete in ${Date.now() - fetchStart}ms`);

          // 1. Add kitchen reference images (in order)
          if (hasKitchenScan && kitchenResults.length > 0) {
            contentParts.push('\n--- KITCHEN (START) REFERENCE IMAGES ---');
            for (const result of kitchenResults) {
              if (result) {
                contentParts.push({ inlineData: { data: result.base64, mimeType: 'image/jpeg' } });
                contentParts.push(`[REFERENCE: ${result.label}]`);
              }
            }
          }

          // 2. Add pathway waypoint images (in order)
          if (hasPathway && pathwayResults.length > 0) {
            contentParts.push('\n--- PATHWAY WAYPOINT IMAGES ---');
            for (const result of pathwayResults) {
              if (result) {
                contentParts.push({ inlineData: { data: result.base64, mimeType: 'image/jpeg' } });
                contentParts.push(`[REFERENCE: ${result.label}]`);
              }
            }
          }

          // 3. Add zone reference images (in order)
          if (zone && hasZoneScan && zoneResults.length > 0) {
            contentParts.push(`\n--- ${zone.name.toUpperCase()} ZONE REFERENCE IMAGES ---`);
            for (const result of zoneResults) {
              if (result) {
                contentParts.push({ inlineData: { data: result.base64, mimeType: 'image/jpeg' } });
                contentParts.push(`[REFERENCE: ${result.label}]`);
              }
            }
          }

          // 4. Add guest's current view (most important - last)
          contentParts.push('\n--- GUEST\'S CURRENT CAMERA VIEW (ANALYZE THIS) ---');
          contentParts.push(guestImagePart);

          const result = await model.generateContent(contentParts);
          const response = await result.response;
          const text = response.text();

          // Parse the JSON response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('Invalid AI response format');
          }

          const navigationResponse: NavigationResponse = JSON.parse(jsonMatch[0]);

          // If arrived, include the item's instructions
          if (navigationResponse.arrived) {
            navigationResponse.next_instruction = item.instructions ||
              `You've found the ${itemName}! ${item.hint || ''}`;
          }

          // Log the scan
          const { data: recentLog } = await supabase
            .from('guest_kit_access_logs')
            .select('id, scans_performed')
            .eq('kit_id', kitId)
            .order('accessed_at', { ascending: false })
            .limit(1)
            .single();

          if (recentLog) {
            await supabase
              .from('guest_kit_access_logs')
              .update({ scans_performed: (recentLog.scans_performed || 0) + 1 })
              .eq('id', recentLog.id);
          }

          return successResponse({
            navigation: navigationResponse,
            item: {
              name: itemName,
              instructions: item.instructions,
              warning: item.warning_text,
              destination_image_url: item.destination_image_url,
              control_image_url: item.control_image_url,
            },
            zone: zone ? {
              name: zone.name,
              zone_type: zone.zone_type,
            } : null,
          });
        } catch (aiError) {
          console.error('AI navigation error:', aiError);

          // Fallback response
          return successResponse({
            navigation: {
              location_identified: 'unknown',
              confidence: 0,
              next_instruction: `I couldn't identify your location clearly. Try pointing your camera at a doorway or landmark. You're looking for the ${itemName}${zone ? ` in the ${zone.name}` : ''}. ${item.hint || ''}`,
              arrived: false,
              step_number: currentStep || 1,
              total_steps: totalSteps,
            },
            item: {
              name: itemName,
              instructions: item.instructions,
              warning: item.warning_text,
              destination_image_url: item.destination_image_url,
            },
          });
        }
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[guest-access] Function error:', error.message);
    return errorResponse('Internal server error', 500);
  }
});

// Helper function to get item type name
function getItemTypeName(itemType: string): string {
  const names: Record<string, string> = {
    water_shutoff: 'Water Shutoff',
    gas_shutoff: 'Gas Shutoff',
    electrical_panel: 'Electrical Panel',
    fire_extinguisher: 'Fire Extinguisher',
    first_aid: 'First Aid Kit',
    emergency_exits: 'Emergency Exits',
    smoke_detector: 'Smoke Detector',
    co_detector: 'CO Detector',
    thermostat: 'Thermostat',
    water_heater: 'Water Heater',
    furnace: 'Furnace',
    ac_unit: 'AC Unit',
    circuit_breaker: 'Circuit Breaker',
    washer_dryer: 'Washer & Dryer',
    dishwasher: 'Dishwasher',
    oven: 'Oven',
    garbage_disposal: 'Garbage Disposal',
    coffee_maker: 'Coffee Maker',
    tv_remote: 'TV & Remote',
    wifi_router: 'WiFi Router',
    garage_door: 'Garage Door',
    door_locks: 'Door Locks',
    trash_recycling: 'Trash & Recycling',
    pool_controls: 'Pool Controls',
    hot_tub: 'Hot Tub',
    custom: 'Custom Item',
  };
  return names[itemType] || itemType;
}
