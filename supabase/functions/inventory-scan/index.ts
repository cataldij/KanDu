/**
 * Inventory Scan Edge Function
 * Analyzes fridge/pantry/toolbox images to identify items and their quantity levels
 * Generates shopping list suggestions for low items
 *
 * POST /functions/v1/inventory-scan
 * Body: { imageBase64, scanType: 'refrigerator' | 'pantry' | 'toolbox' | 'garage', context?: string }
 * Returns: { inventory: InventoryItem[], shoppingList: ShoppingItem[], summary: string }
 */

import { GoogleGenerativeAI, SchemaType } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';

// Define the response schema for structured output
const inventoryScanSchema = {
  type: SchemaType.OBJECT,
  properties: {
    inventory: {
      type: SchemaType.ARRAY,
      description: "List of items detected in the image",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Name of the item"
          },
          category: {
            type: SchemaType.STRING,
            description: "Category: dairy, produce, meat, condiments, beverages, grains, frozen, tools, hardware, cleaning, other"
          },
          quantityLevel: {
            type: SchemaType.STRING,
            description: "Estimated quantity: full, good, half, low, empty, unknown"
          },
          quantityEstimate: {
            type: SchemaType.STRING,
            description: "Human-readable quantity estimate like '3 eggs', 'half gallon', '~1 cup'"
          },
          needsRestock: {
            type: SchemaType.BOOLEAN,
            description: "True if item should be restocked soon"
          },
          confidence: {
            type: SchemaType.NUMBER,
            description: "Confidence score 0.0-1.0"
          },
          location: {
            type: SchemaType.STRING,
            description: "Where in the image: top shelf, door, crisper drawer, etc."
          }
        },
        required: ["name", "category", "quantityLevel", "needsRestock", "confidence"]
      }
    },
    shoppingList: {
      type: SchemaType.ARRAY,
      description: "Suggested items to buy based on low/empty items",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          itemName: {
            type: SchemaType.STRING,
            description: "Name of item to buy"
          },
          suggestedQuantity: {
            type: SchemaType.STRING,
            description: "Recommended quantity to purchase"
          },
          category: {
            type: SchemaType.STRING,
            description: "Shopping category for grouping"
          },
          priority: {
            type: SchemaType.STRING,
            description: "Priority: critical, normal, optional"
          },
          reason: {
            type: SchemaType.STRING,
            description: "Why this is needed: 'empty', 'running low', 'expires soon'"
          },
          storeSection: {
            type: SchemaType.STRING,
            description: "Where to find in store: dairy aisle, produce section, etc."
          }
        },
        required: ["itemName", "suggestedQuantity", "category", "priority"]
      }
    },
    summary: {
      type: SchemaType.STRING,
      description: "Brief summary of inventory status (1-2 sentences)"
    },
    totalItemsDetected: {
      type: SchemaType.INTEGER,
      description: "Total number of items identified"
    },
    itemsNeedingRestock: {
      type: SchemaType.INTEGER,
      description: "Number of items that need restocking"
    },
    suggestions: {
      type: SchemaType.ARRAY,
      description: "Optional meal/project suggestions based on available items",
      items: {
        type: SchemaType.STRING
      }
    }
  },
  required: ["inventory", "shoppingList", "summary", "totalItemsDetected", "itemsNeedingRestock"]
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    console.log('[inventory-scan] Function started');

    // Verify authentication
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      console.log('[inventory-scan] Auth failed:', authError);
      return unauthorizedResponse(authError || 'Authentication required');
    }
    console.log('[inventory-scan] Auth OK, user:', user.id);

    // Parse request body
    const body = await req.json();
    const { imageBase64, scanType, context } = body;

    if (!imageBase64) {
      return errorResponse('imageBase64 is required', 400);
    }

    const validScanTypes = ['refrigerator', 'pantry', 'toolbox', 'garage', 'other'];
    const normalizedScanType = scanType && validScanTypes.includes(scanType) ? scanType : 'refrigerator';

    console.log('[inventory-scan] Scan type:', normalizedScanType);

    // Get Gemini API key
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('[inventory-scan] GEMINI_API_KEY not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Initialize Gemini with structured output
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: inventoryScanSchema,
      },
    });

    // Build the prompt based on scan type
    const prompts: Record<string, string> = {
      refrigerator: `You are KanDu, an expert at analyzing refrigerator contents.
Carefully examine this refrigerator image and identify ALL visible items.

For each item:
1. Identify what it is (be specific: "2% milk" not just "milk")
2. Estimate the quantity level based on container fullness, number visible, etc.
3. Determine if it needs restocking (low or empty = needs restock)
4. Note its location (top shelf, door, crisper drawer, etc.)

Categories to use: dairy, produce, meat, condiments, beverages, grains, frozen, leftovers, other

IMPORTANT for quantity estimation:
- Look at container fullness (milk jug 1/4 full = "low")
- Count individual items (3 eggs visible = "low", 10+ = "good")
- Check expiration indicators if visible
- When in doubt about quantity, mark as "unknown"

Generate a shopping list for items that are low, empty, or missing essentials.
Priority levels:
- critical: Empty or almost empty staples (milk, eggs, bread)
- normal: Low items that will need replacement soon
- optional: Nice to have restocks

${context ? `Additional context: ${context}` : ''}`,

      pantry: `You are KanDu, an expert at analyzing pantry contents.
Examine this pantry/cupboard image and identify all visible items.

For each item:
1. Identify the item (be specific about brand/type if visible)
2. Estimate quantity level based on package fullness or count
3. Determine if restocking is needed
4. Note shelf location

Categories: grains, canned goods, snacks, baking, pasta, cereals, spices, oils, sauces, other

Look for:
- Nearly empty boxes/bags
- Single remaining items
- Staples that might be missing
- Items that typically come in multiples

${context ? `Additional context: ${context}` : ''}`,

      toolbox: `You are KanDu, an expert at analyzing tool and hardware inventory.
Examine this toolbox/workshop area and identify tools and supplies.

For each item:
1. Identify the tool or supply
2. Assess condition/quantity (full set, missing pieces, low supply)
3. Determine if replacement/restocking is needed
4. Note organization/location

Categories: hand tools, power tools, fasteners (screws, nails, bolts), electrical, plumbing, safety gear, adhesives, other

For consumables (screws, nails, tape, etc.):
- Estimate if supply is adequate for typical projects
- Mark as "low" if container is less than 1/4 full

${context ? `Additional context: ${context}` : ''}`,

      garage: `You are KanDu, analyzing garage storage and supplies.
Identify automotive supplies, outdoor equipment, and stored items.

Categories: automotive, lawn care, outdoor, storage, seasonal, cleaning, other

Focus on:
- Consumables that need replacement (oil, fluids, fertilizer)
- Equipment condition
- Safety supplies

${context ? `Additional context: ${context}` : ''}`,

      other: `You are KanDu, analyzing the contents of this storage area.
Identify all visible items, estimate quantities, and suggest items that need restocking.

${context ? `Additional context: ${context}` : ''}`
    };

    const prompt = prompts[normalizedScanType] || prompts.other;

    console.log('[inventory-scan] Calling Gemini API...');

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      },
    ]);

    const responseText = result.response.text();
    console.log('[inventory-scan] Gemini response received, length:', responseText.length);

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[inventory-scan] JSON parse error:', parseError);
      return errorResponse('Failed to parse AI response', 500);
    }

    // Store the scan in the database
    try {
      const { error: insertError } = await supabase
        .from('inventory_scans')
        .insert({
          user_id: user.id,
          scan_type: normalizedScanType,
          analysis_result: parsed,
        });

      if (insertError) {
        console.warn('[inventory-scan] Failed to save scan:', insertError.message);
        // Don't fail the request, just log the warning
      } else {
        console.log('[inventory-scan] Scan saved to database');
      }
    } catch (dbError) {
      console.warn('[inventory-scan] Database error:', dbError);
      // Continue without failing
    }

    // Return the analysis result
    return new Response(
      JSON.stringify({
        success: true,
        scanType: normalizedScanType,
        ...parsed,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[inventory-scan] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
