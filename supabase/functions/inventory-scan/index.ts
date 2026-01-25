/**
 * Inventory Scan Edge Function
 * Analyzes fridge/pantry/toolbox images to identify items and their quantity levels
 * Generates shopping list suggestions for low items
 *
 * POST /functions/v1/inventory-scan
 * Body: {
 *   images: string[] (array of base64 images),
 *   imageBase64?: string (legacy single image support),
 *   scanType: 'refrigerator' | 'pantry' | 'toolbox' | 'garage',
 *   context?: string
 * }
 * Returns: { inventory: InventoryItem[], shoppingList: ShoppingItem[], summary: string }
 */

import { GoogleGenerativeAI, SchemaType } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';

// Define the response schema for structured output with REAL product recognition
const inventoryScanSchema = {
  type: SchemaType.OBJECT,
  properties: {
    inventory: {
      type: SchemaType.ARRAY,
      description: "List of specific products detected in the image with brand and size details",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Full product name with brand if visible (e.g., 'Heinz Tomato Ketchup', 'Chobani Greek Yogurt Strawberry')"
          },
          genericName: {
            type: SchemaType.STRING,
            description: "Generic item type (e.g., 'ketchup', 'greek yogurt', 'whole milk')"
          },
          brand: {
            type: SchemaType.STRING,
            description: "Brand name if visible (e.g., 'Heinz', 'Chobani', 'Kraft'). Use 'Store Brand' or 'Unknown' if not visible"
          },
          size: {
            type: SchemaType.STRING,
            description: "Package size if visible (e.g., '32 oz', '1 gallon', '12 pack', 'family size')"
          },
          variety: {
            type: SchemaType.STRING,
            description: "Specific variety/flavor (e.g., 'Honey Nut', 'Extra Virgin', '2% Reduced Fat', 'Original')"
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
            description: "Human-readable quantity estimate like '3 eggs', 'half gallon', '~1 cup remaining'"
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
        required: ["name", "genericName", "brand", "category", "quantityLevel", "needsRestock", "confidence"]
      }
    },
    shoppingList: {
      type: SchemaType.ARRAY,
      description: "Specific products to buy with searchable terms for online shopping",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          itemName: {
            type: SchemaType.STRING,
            description: "Full product name to search for (e.g., 'Heinz Tomato Ketchup 32oz')"
          },
          searchTerms: {
            type: SchemaType.STRING,
            description: "Optimized search query for finding this product online (e.g., 'heinz ketchup 32 oz bottle')"
          },
          genericAlternative: {
            type: SchemaType.STRING,
            description: "Generic version if brand not important (e.g., 'tomato ketchup 32oz')"
          },
          brand: {
            type: SchemaType.STRING,
            description: "Preferred brand based on what was detected"
          },
          size: {
            type: SchemaType.STRING,
            description: "Recommended size to purchase"
          },
          suggestedQuantity: {
            type: SchemaType.STRING,
            description: "How many to buy (e.g., '1', '2 pack', '1 dozen')"
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
          },
          estimatedPrice: {
            type: SchemaType.STRING,
            description: "Rough price estimate if known (e.g., '$3-5', '$2.99')"
          }
        },
        required: ["itemName", "searchTerms", "genericAlternative", "suggestedQuantity", "category", "priority"]
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
    let body;
    try {
      body = await req.json();
      console.log('[inventory-scan] Body received, keys:', Object.keys(body));
      console.log('[inventory-scan] images array length:', body.images?.length || 0);
      console.log('[inventory-scan] First image size:', body.images?.[0]?.length || 0, 'chars');
    } catch (parseErr) {
      console.error('[inventory-scan] Failed to parse request body:', parseErr);
      return errorResponse('Invalid request body', 400);
    }
    const { images, imageBase64, scanType, context } = body;

    // Support both new multi-image format and legacy single image
    const imageArray: string[] = images && Array.isArray(images) && images.length > 0
      ? images
      : imageBase64
        ? [imageBase64]
        : [];

    if (imageArray.length === 0) {
      return errorResponse('At least one image is required (images array or imageBase64)', 400);
    }

    console.log('[inventory-scan] Processing', imageArray.length, 'image(s)');

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
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: inventoryScanSchema,
      },
    });

    // Build the prompt based on scan type - emphasizing TRUE PRODUCT RECOGNITION
    const prompts: Record<string, string> = {
      refrigerator: `You are KanDu, an expert product recognition AI for shopping assistance.
Carefully examine ${imageArray.length > 1 ? 'these refrigerator images' : 'this refrigerator image'} and create a COMPLETE inventory of EVERY visible product.
${imageArray.length > 1 ? 'Combine findings from all images into a single comprehensive inventory.' : ''}

**CRITICAL: CATALOG EVERYTHING**
You MUST identify EVERY visible item, regardless of quantity level. Include:
- Full items (recently purchased)
- Partially used items
- Nearly empty items
- Items that are hard to see but partially visible
The user wants a COMPLETE picture of what's in their fridge, not just low items.

**CRITICAL: READ PRODUCT LABELS CAREFULLY**
For EACH item, you MUST identify:
1. **BRAND NAME** - Read the label! (Heinz, Kraft, Chobani, Great Value, Kirkland, etc.)
2. **SPECIFIC PRODUCT** - Full name (e.g., "Heinz Simply Tomato Ketchup", not just "ketchup")
3. **SIZE/QUANTITY** - Read the oz, lb, gallon, pack size from the label
4. **VARIETY/FLAVOR** - 2% milk, honey mustard, strawberry yogurt, etc.
5. **Quantity level** - CAREFULLY assess how much is left (see guidelines below)
6. **Location** - Where in the fridge

**CRITICAL: QUANTITY LEVEL ASSESSMENT GUIDELINES**
Look carefully at VISUAL CUES to determine actual fill level:

For BOTTLES/JARS (sauces, condiments, dressings, beverages):
- Look at the LIQUID LINE through the container - where does the product actually reach?
- Squeeze bottles (ketchup, BBQ sauce, mustard): Look for air pockets, collapsed sides, or if bottle appears light/deflated
- Glass jars: Look at actual fill level compared to jar height
- If bottle appears mostly air or product is only in bottom portion = "low" or "empty"
- If you can see the product is below the label = likely "half" or "low"

For MILK/BEVERAGE CARTONS:
- Heavy/full carton sitting upright = "full" or "good"
- Light carton or tilted/leaning = "low" or "empty"
- Look at any visible liquid level through translucent areas

For PACKAGED ITEMS (deli meat, cheese, yogurt):
- Flat/thin package = "low" or "empty"
- Puffy/full package = "full" or "good"
- Count visible items if possible (e.g., 2 yogurts left = specific count)

QUANTITY LEVELS DEFINED:
- **full**: 80-100% remaining, recently purchased appearance
- **good**: 50-80% remaining, clearly plenty left
- **half**: ~50% remaining
- **low**: 10-30% remaining, NEEDS RESTOCKING SOON (needsRestock = true)
- **empty**: <10% remaining or appears nearly gone (needsRestock = true)

**IMPORTANT**: When uncertain, err on the side of LOWER quantity. It's better to suggest restocking something that's actually half-full than to miss something that's nearly empty.

EXAMPLES of good product identification:
- "Chobani Greek Yogurt Strawberry 5.3oz" NOT "yogurt"
- "Horizon Organic 2% Milk 1 Gallon" NOT "milk"
- "Hellmann's Real Mayonnaise 30oz" NOT "mayonnaise"
- "Oscar Mayer Turkey Deli Meat 16oz" NOT "deli meat"
- "Philadelphia Original Cream Cheese 8oz" NOT "cream cheese"

For the SHOPPING LIST:
- Include **searchTerms** that work for online grocery shopping (Instacart, Amazon Fresh, Walmart)
- Include the **brand** they already have (brand loyalty)
- Include **genericAlternative** for budget shoppers
- Include **estimatedPrice** ranges when possible

Categories: dairy, produce, meat, condiments, beverages, grains, frozen, leftovers, other

${context ? `Additional context: ${context}` : ''}`,

      pantry: `You are KanDu, an expert product recognition AI for shopping assistance.
Examine ${imageArray.length > 1 ? 'these pantry/cupboard images' : 'this pantry/cupboard image'} and create a COMPLETE inventory of EVERY visible product.
${imageArray.length > 1 ? 'Combine findings from all images into a single comprehensive inventory.' : ''}

**CRITICAL: CATALOG EVERYTHING**
You MUST identify EVERY visible item, regardless of quantity level:
- Full/unopened items
- Partially used items
- Nearly empty containers
- Items partially hidden but visible
The user wants a COMPLETE inventory, not just items running low.

**CRITICAL: READ EVERY LABEL**
For EACH item identify:
1. **BRAND** - Read it from the package (Quaker, Barilla, Campbell's, Prego, etc.)
2. **FULL PRODUCT NAME** - "Barilla Penne Pasta 16oz" not "pasta"
3. **SIZE** - oz, lb, count from package
4. **VARIETY** - Whole grain, low sodium, organic, etc.
5. **Quantity level** - CAREFULLY assess how much remains

**CRITICAL: QUANTITY LEVEL ASSESSMENT GUIDELINES**
Look at VISUAL CUES to determine actual fill level:

For BOXES/BAGS (cereal, pasta, rice, snacks):
- Lightweight/crushed/partially collapsed box = "low" or "empty"
- Full, heavy-looking box with crisp edges = "full" or "good"
- If box/bag appears partially consumed or crinkled = "half" or "low"

For JARS/BOTTLES (oils, sauces, peanut butter, honey):
- Look at actual fill level - where does product reach?
- Jar with product only in bottom third = "low" or "empty"
- Nearly full jar with small headspace = "full"

For CANNED GOODS:
- Cans are typically "full" unless opened
- Note quantity of cans visible (e.g., "2 cans remaining")

For SPICES/SEASONINGS:
- Small containers often hard to judge - note if appears nearly empty

QUANTITY LEVELS DEFINED:
- **full**: 80-100% remaining
- **good**: 50-80% remaining
- **half**: ~50% remaining
- **low**: 10-30% remaining (needsRestock = true)
- **empty**: <10% remaining (needsRestock = true)

**IMPORTANT**: When uncertain, err on the side of LOWER quantity.

EXAMPLES:
- "Quaker Old Fashioned Oats 42oz" NOT "oatmeal"
- "Barilla Whole Grain Spaghetti 16oz" NOT "pasta"
- "Campbell's Cream of Mushroom Soup 10.5oz" NOT "soup"
- "Skippy Creamy Peanut Butter 40oz" NOT "peanut butter"

For SHOPPING LIST items:
- **searchTerms**: Optimized for Instacart/Amazon Fresh search
- **brand**: Match what they buy
- **estimatedPrice**: Approximate cost

Categories: grains, canned goods, snacks, baking, pasta, cereals, spices, oils, sauces, other

${context ? `Additional context: ${context}` : ''}`,

      toolbox: `You are KanDu, an expert at identifying tools and hardware for shopping lists.
Examine ${imageArray.length > 1 ? 'these toolbox/workshop images' : 'this toolbox/workshop area'} and identify tools and supplies WITH BRANDS AND SPECIFICATIONS.
${imageArray.length > 1 ? 'Combine findings from all images into a single comprehensive inventory.' : ''}

**READ TOOL MARKINGS AND LABELS**
Identify:
1. **BRAND** - DeWalt, Milwaukee, Craftsman, Stanley, 3M, etc.
2. **SPECIFIC TOOL/SUPPLY** - "DeWalt 20V MAX Cordless Drill" not "drill"
3. **SIZE/SPECS** - Bit sizes, screw gauges, tape width, etc.

EXAMPLES:
- "Milwaukee M18 Impact Driver" NOT "power tool"
- "Stanley 25ft PowerLock Tape Measure" NOT "tape measure"
- "#8 x 1-1/4 inch Wood Screws (approx 50 remaining)" NOT "screws"
- "3M 2090 Blue Painter's Tape 1.88in" NOT "tape"

For SHOPPING LIST:
- Include Home Depot / Lowe's searchable terms
- Include exact specifications for consumables

Categories: hand tools, power tools, fasteners, electrical, plumbing, safety gear, adhesives, other

${context ? `Additional context: ${context}` : ''}`,

      garage: `You are KanDu, analyzing garage storage with FULL PRODUCT RECOGNITION.
${imageArray.length > 1 ? 'Examine these images and identify' : 'Identify'} all products with BRANDS and SPECIFICATIONS.
${imageArray.length > 1 ? 'Combine findings from all images into a single comprehensive inventory.' : ''}

**READ ALL LABELS**
- Motor oil: "Mobil 1 5W-30 Full Synthetic" not "oil"
- Lawn products: "Scotts Turf Builder 15000 sq ft" not "fertilizer"
- Auto supplies: "Rain-X Original Windshield Washer Fluid 1 Gallon"

Categories: automotive, lawn care, outdoor, storage, seasonal, cleaning, other

For SHOPPING LIST:
- Include AutoZone/Home Depot searchable terms
- Include vehicle compatibility if relevant

${context ? `Additional context: ${context}` : ''}`,

      other: `You are KanDu, a product recognition AI for shopping assistance.
Identify all visible items with MAXIMUM DETAIL including brand, size, variety.
Generate shopping-ready search terms for any items needing restock.

${context ? `Additional context: ${context}` : ''}`
    };

    const prompt = prompts[normalizedScanType] || prompts.other;

    console.log('[inventory-scan] Calling Gemini API with', imageArray.length, 'image(s)...');
    console.log('[inventory-scan] Prompt length:', prompt.length, 'chars');

    // Build content array with prompt and all images
    const contentParts: any[] = [{ text: prompt }];
    console.log('[inventory-scan] Building content parts...');

    // Add all images to the request
    for (const imgBase64 of imageArray) {
      contentParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imgBase64,
        },
      });
    }

    let result;
    try {
      result = await model.generateContent(contentParts);
    } catch (geminiError) {
      console.error('[inventory-scan] Gemini API error:', geminiError);
      const errorMessage = geminiError instanceof Error ? geminiError.message : 'Gemini API failed';
      return errorResponse(`AI analysis failed: ${errorMessage}`, 500);
    }

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
