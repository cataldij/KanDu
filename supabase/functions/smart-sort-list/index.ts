/**
 * Smart Sort Shopping List
 * Uses Gemini to intelligently organize items by typical store layout
 */

import { GoogleGenerativeAI, SchemaType } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/auth.ts';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') || '');

interface SmartSortRequest {
  items: string[];
  storeType?: 'grocery' | 'walmart' | 'target' | 'kroger' | 'whole_foods';
}

interface SortedItem {
  name: string;
  section: string;
  sectionOrder: number;
  reasoning?: string;
}

interface SmartSortResponse {
  sortedItems: SortedItem[];
  sections: string[];
}

const sortingSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sortedItems: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "The item name",
          },
          section: {
            type: SchemaType.STRING,
            description: "Store section (e.g., Produce, Dairy, Frozen)",
          },
          sectionOrder: {
            type: SchemaType.NUMBER,
            description: "Order number for optimal shopping flow (1 = first)",
          },
          reasoning: {
            type: SchemaType.STRING,
            description: "Why this item goes in this section",
            nullable: true,
          },
        },
        required: ["name", "section", "sectionOrder"],
      },
    },
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.STRING,
      },
      description: "Ordered list of all sections in optimal shopping order",
    },
  },
  required: ["sortedItems", "sections"],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const { items, storeType = 'grocery' } = await req.json() as SmartSortRequest;

    if (!items || items.length === 0) {
      return errorResponse('No items provided', 400);
    }

    console.log(`[smart-sort] Sorting ${items.length} items for ${storeType} store`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: sortingSchema,
      },
    });

    const prompt = `
You are a grocery store shopping assistant. Organize these shopping list items in the most efficient order for shopping at a typical ${storeType} store.

Shopping list:
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Rules for optimal shopping flow:
1. START with items at the store entrance (typically produce, flowers)
2. MOVE through dry goods, bakery, and center aisles
3. PICK UP refrigerated items (dairy, meat, deli) in the middle-to-end
4. END with frozen items (so they stay cold)

Common store sections in optimal order:
1. Produce (fresh fruits, vegetables) - Front/entrance
2. Floral (flowers, plants) - Front
3. Bakery (bread, pastries) - Left side near entrance
4. Deli (cold cuts, prepared foods) - Middle
5. Meat & Seafood (fresh meat, fish) - Middle-back
6. Dairy (milk, eggs, cheese, yogurt) - Back wall
7. Pantry/Dry Goods (canned, boxed, pasta, rice, snacks) - Center aisles
8. Beverages (soda, juice, water) - Center aisles
9. Household (cleaning, paper goods) - Side aisles
10. Health & Beauty (medicine, cosmetics) - Side aisles
11. Frozen Foods (ice cream, frozen meals) - Back wall, LAST

Important:
- Group similar items together (all dairy together, all produce together)
- Put frozen items LAST (they'll stay cold)
- Put produce FIRST (handle gently, won't get crushed)
- Be practical - this saves the shopper time and keeps food fresh

Return the items sorted by optimal shopping flow, with section names and order numbers.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log('[smart-sort] Gemini response:', responseText.substring(0, 200));

    const sortedData = JSON.parse(responseText) as SmartSortResponse;

    // Validate response
    if (!sortedData.sortedItems || sortedData.sortedItems.length === 0) {
      throw new Error('No sorted items returned from Gemini');
    }

    console.log(`[smart-sort] Successfully sorted ${sortedData.sortedItems.length} items into ${sortedData.sections.length} sections`);

    return new Response(
      JSON.stringify({
        success: true,
        sortedItems: sortedData.sortedItems,
        sections: sortedData.sections,
        originalCount: items.length,
        sortedCount: sortedData.sortedItems.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('[smart-sort] Error:', error);
    return errorResponse(error.message || 'Failed to sort shopping list', 500);
  }
});
