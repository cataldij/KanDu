/**
 * suggest-recipes - AI-powered recipe suggestion endpoint
 * Uses Gemini to suggest recipes based on user preferences
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { GoogleGenerativeAI, SchemaType } from 'https://esm.sh/@google/generative-ai@0.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Response schema for structured output
const recipeSchema = {
  type: SchemaType.OBJECT,
  properties: {
    recipes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: 'Recipe name' },
          emoji: { type: SchemaType.STRING, description: 'Food emoji representing the dish' },
          description: { type: SchemaType.STRING, description: 'Brief appetizing description' },
          prepTime: { type: SchemaType.NUMBER, description: 'Prep time in minutes' },
          cookTime: { type: SchemaType.NUMBER, description: 'Cook time in minutes' },
          difficulty: { type: SchemaType.STRING, enum: ['Easy', 'Medium', 'Hard'] },
          servings: { type: SchemaType.NUMBER, description: 'Number of servings' },
          cuisine: { type: SchemaType.STRING, description: 'Cuisine type' },
          ingredients: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING },
                quantity: { type: SchemaType.STRING },
                unit: { type: SchemaType.STRING },
              },
              required: ['name', 'quantity', 'unit'],
            },
          },
          steps: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                stepNumber: { type: SchemaType.NUMBER },
                instruction: { type: SchemaType.STRING },
                duration: { type: SchemaType.NUMBER, description: 'Duration in minutes if applicable' },
                tip: { type: SchemaType.STRING, description: 'Optional helpful tip' },
              },
              required: ['stepNumber', 'instruction'],
            },
          },
        },
        required: ['name', 'emoji', 'description', 'prepTime', 'cookTime', 'difficulty', 'servings', 'ingredients', 'steps'],
      },
    },
  },
  required: ['recipes'],
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const { mealType, servings, energy, mood, cuisine, specificDish, surprise } = await req.json();

    // Build the prompt based on inputs
    let promptContext = `You are a helpful cooking assistant. Suggest recipes based on the following preferences:

CONTEXT:
- Meal type: ${mealType || 'any meal'}
- Servings: ${servings || '2-4'}
- Energy/Effort level: ${energy || 'medium'} (quick = under 30 min, invested = can take time)
`;

    if (mood) {
      const moodDescriptions: Record<string, string> = {
        comfort: 'warm, cozy, satisfying comfort food',
        light: 'fresh, healthy, lighter options',
        bold: 'flavorful, spicy, exciting dishes',
        quick: 'fast recipes under 30 minutes',
      };
      promptContext += `- Mood: ${moodDescriptions[mood] || mood}\n`;
    }

    if (cuisine) {
      promptContext += `- Cuisine preference: ${cuisine}\n`;
    }

    if (specificDish) {
      promptContext += `- Specific dish requested: "${specificDish}"\n`;
    }

    if (surprise) {
      promptContext += `- User wants to be surprised! Pick diverse, interesting options.\n`;
    }

    // Determine how many recipes to return
    const numRecipes = specificDish ? 1 : (surprise ? 4 : 3);

    const prompt = `${promptContext}

INSTRUCTIONS:
${specificDish
  ? `Return exactly 1 recipe for "${specificDish}" with full details.`
  : `Return exactly ${numRecipes} diverse recipe suggestions that match the criteria.`
}

For each recipe, provide:
1. A catchy name
2. An appropriate food emoji
3. A brief, appetizing description (1-2 sentences)
4. Accurate prep and cook times in minutes
5. Difficulty level (Easy/Medium/Hard) - "quick" energy should be Easy
6. Number of servings (should match requested servings)
7. Complete ingredient list with precise quantities
8. Clear step-by-step instructions (5-10 steps typically)
9. Include helpful tips where appropriate

Make the recipes practical, delicious, and achievable for home cooks.
Adjust complexity based on energy level:
- "quick" = simple recipes, minimal ingredients, under 30 min total
- "invested" = can be more complex, premium ingredients, longer cook times

IMPORTANT: Return ONLY the JSON response, no additional text.`;

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: recipeSchema,
        temperature: 0.8, // A bit creative for recipe variety
      },
    });

    console.log('[suggest-recipes] Generating recipes with params:', { mealType, servings, energy, mood, cuisine, specificDish, surprise });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('[suggest-recipes] Raw response:', text.substring(0, 500));

    // Parse the response
    const data = JSON.parse(text);

    if (!data.recipes || !Array.isArray(data.recipes)) {
      throw new Error('Invalid response structure');
    }

    console.log('[suggest-recipes] Successfully generated', data.recipes.length, 'recipes');

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[suggest-recipes] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        recipes: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
