import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * Convert local file URI to base64 for Gemini API
 */
async function fileToGenerativePart(uri: string, mimeType: string) {
  try {
    console.log('Reading file:', uri);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    console.log('File read successfully, base64 length:', base64.length);
    return {
      inlineData: {
        data: base64,
        mimeType,
      },
    };
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error(`Failed to read ${mimeType} file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface DiagnosisRequest {
  category: string;
  description: string;
  imageUri?: string;
  videoUri?: string;
}

export interface FreeDiagnosis {
  diagnosis: {
    summary: string;
    likelyCauses: string[];
  };
  triage: {
    riskLevel: 'low' | 'medium' | 'high';
    urgency: 'immediate' | 'soon' | 'can_wait';
    isDIYable: boolean;
  };
  detectedItem?: {
    label: string;
    confidence: 'high' | 'medium' | 'low';
  };
  youtubeVideos: Array<{
    title: string;
    searchQuery: string;
    relevance: string;
  }>;
  safetyWarnings: string[];
  nextSteps: string[];
}

export interface AdvancedDiagnosis {
  diagnosis: {
    summary: string;
    likelyCauses: string[];
    detailedAnalysis: string;
    productIdentification?: {
      brand: string;
      model: string;
      confidence: 'high' | 'medium' | 'low';
      alternativeMatches?: string[];
    };
  };
  triage: {
    riskLevel: 'low' | 'medium' | 'high';
    urgency: 'immediate' | 'soon' | 'can_wait';
    isDIYable: boolean;
  };
  stepByStep: string[];
  partsList: Array<{
    name: string;
    searchTerms: string;
    estimatedCost: string;
    partNumber?: string;
    whereToBuy?: string;
  }>;
  toolsList: Array<{
    name: string;
    searchTerms: string;
    estimatedCost?: string;
    required: boolean;
  }>;
  safetyWarnings: string[];
  detailedSafety: string[];
  troubleshooting: string[];
  youtubeVideos: Array<{
    title: string;
    searchQuery: string;
    relevance: string;
  }>;
}

/**
 * Get a free diagnosis using Gemini 2.5 Flash (cost-optimized)
 */
export async function getFreeDiagnosis(
  request: DiagnosisRequest
): Promise<FreeDiagnosis> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let promptText = `FREE DIAGNOSIS — ${request.videoUri ? 'VIDEO' : 'IMAGE'} ANALYSIS

You are KanDu Free Diagnostic AI. Analyze the ${request.videoUri ? 'video (visual + audio)' : 'image'} and provide a quick, helpful triage.

Category: ${request.category}
Problem description: ${request.description}

YOUR TASK:
1. Identify the item/appliance in the image (e.g., "GE Dishwasher", "Toilet Fill Valve", "Honda Civic Engine")
2. Provide a clear, concise diagnosis (2-3 sentences)
3. List 2-3 likely causes
4. Assess risk level and urgency
5. Determine if this is DIY-able or needs a pro
6. Recommend 3 helpful YouTube videos with search queries
7. List critical safety warnings
8. Suggest immediate next steps

OUTPUT (STRICT JSON ONLY):
{
  "detectedItem": {
    "label": "Brand + Item type (e.g., 'GE Dishwasher', 'Kohler Toilet', 'Ford F-150 Engine')",
    "confidence": "high" | "medium" | "low"
  },
  "diagnosis": {
    "summary": "Clear 2-3 sentence explanation of what's likely wrong",
    "likelyCauses": [
      "Most likely cause 1",
      "Possible cause 2",
      "Possible cause 3"
    ]
  },
  "triage": {
    "riskLevel": "low" | "medium" | "high",
    "urgency": "immediate" | "soon" | "can_wait",
    "isDIYable": true or false
  },
  "youtubeVideos": [
    {
      "title": "Descriptive title for what this video shows",
      "searchQuery": "exact search terms to find this video on YouTube",
      "relevance": "Why this video is helpful for this specific issue"
    },
    {
      "title": "...",
      "searchQuery": "...",
      "relevance": "..."
    },
    {
      "title": "...",
      "searchQuery": "...",
      "relevance": "..."
    }
  ],
  "safetyWarnings": [
    "Critical safety warning 1",
    "Critical safety warning 2"
  ],
  "nextSteps": [
    "Immediate action to take (or option to consider)",
    "Second step or alternative",
    "Third option (e.g., call a pro, upgrade for detailed guide)"
  ]
}

IMPORTANT:
- ALWAYS include detectedItem with the identified appliance/item name - this is REQUIRED
- Keep diagnosis simple and actionable
- YouTube searchQuery should be specific enough to find relevant videos (include make/model if visible, specific part names, etc.)
- Safety warnings should be critical only (don't over-warn)
- nextSteps should give clear choices, not detailed repair steps`;

    // Build the content array with text and media
    const contentParts: any[] = [{ text: promptText }];

    // Add image if provided
    if (request.imageUri) {
      const imagePart = await fileToGenerativePart(request.imageUri, 'image/jpeg');
      contentParts.push(imagePart);
    }

    // Add video if provided
    if (request.videoUri) {
      const videoPart = await fileToGenerativePart(request.videoUri, 'video/mp4');
      contentParts.push(videoPart);
    }

    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const diagnosis = JSON.parse(jsonMatch[0]);
    console.log('Free diagnosis parsed. detectedItem:', JSON.stringify(diagnosis.detectedItem));
    return diagnosis;
  } catch (error) {
    console.error('Error getting free diagnosis:', error);
    throw new Error('Failed to analyze the problem. Please try again.');
  }
}

/**
 * Get an advanced diagnosis using Gemini 3 Pro (paid $1.99 feature)
 */
export async function getAdvancedDiagnosis(
  request: DiagnosisRequest
): Promise<AdvancedDiagnosis> {
  try {
    console.log('Getting advanced diagnosis for category:', request.category);

    // Try Gemini 3 Pro first, fall back to 2.5 Pro if not available
    let modelName = 'gemini-3-pro-preview';
    try {
      const testModel = genAI.getGenerativeModel({ model: modelName });
    } catch {
      console.log('Gemini 3 Pro not available, using 2.5 Pro');
      modelName = 'gemini-2.5-pro';
    }

    console.log('Using model:', modelName);
    const model = genAI.getGenerativeModel({ model: modelName });

    let promptText = `ADVANCED REPAIR GUIDE — $1.99 PREMIUM ANALYSIS

You are KanDu Advanced Diagnostic AI. The user paid $1.99 for a comprehensive, personalized repair guide.
Analyze the ${request.videoUri ? 'video (visual + audio)' : 'image'} and provide professional-grade guidance.

Category: ${request.category}
Problem description: ${request.description}

YOUR MISSION:
1. Identify the specific product/brand/model if possible
2. Provide detailed diagnosis with evidence
3. Create step-by-step repair instructions tailored to THIS specific issue
4. Recommend SPECIFIC PRODUCTS (brand + model) for parts and tools - users can click to buy
5. Provide comprehensive safety guidance
6. Include troubleshooting if the fix doesn't work
7. Recommend helpful YouTube videos

OUTPUT (STRICT JSON ONLY):
{
  "diagnosis": {
    "summary": "Clear explanation of what's wrong (2-3 sentences)",
    "likelyCauses": ["Primary cause", "Secondary cause", "Other possibility"],
    "detailedAnalysis": "Comprehensive explanation with evidence from the image/video. Include what you observed, why it points to this diagnosis, and what the user should understand about the problem.",
    "productIdentification": {
      "brand": "Brand name if identifiable, or 'Unknown'",
      "model": "Model number/name if identifiable, or 'Generic [product type]'",
      "confidence": "high" | "medium" | "low",
      "alternativeMatches": ["Alternative brand/model 1", "Alternative 2"]
    }
  },
  "triage": {
    "riskLevel": "low" | "medium" | "high",
    "urgency": "immediate" | "soon" | "can_wait",
    "isDIYable": true or false
  },
  "stepByStep": [
    "Step 1: Detailed first step with specific instructions",
    "Step 2: ...",
    "Step 3: ...",
    "Continue until repair is complete"
  ],
  "partsList": [
    {
      "name": "Brand + Model name (e.g., 'Fluidmaster 400A Fill Valve')",
      "searchTerms": "Optimized search terms for shopping (e.g., 'Fluidmaster 400A toilet fill valve universal')",
      "estimatedCost": "$X-$Y",
      "partNumber": "Exact part number if known",
      "whereToBuy": "Amazon, Home Depot, Lowe's, AutoZone, etc."
    }
  ],
  "toolsList": [
    {
      "name": "Specific tool with size (e.g., 'Channellock 440 12-inch Tongue and Groove Pliers')",
      "searchTerms": "Optimized search terms (e.g., 'Channellock 440 pliers 12 inch')",
      "estimatedCost": "$X-$Y or null if common household item",
      "required": true or false (true = essential, false = helpful but optional)
    }
  ],
  "safetyWarnings": [
    "Critical safety warning 1",
    "Critical safety warning 2"
  ],
  "detailedSafety": [
    "Detailed safety instruction 1 (when to use, how to use)",
    "Detailed safety instruction 2",
    "..."
  ],
  "troubleshooting": [
    "If [X happens], try [Y]",
    "If the problem persists after following all steps, [guidance]",
    "..."
  ],
  "youtubeVideos": [
    {
      "title": "Descriptive title",
      "searchQuery": "Specific search terms (include model/part if known)",
      "relevance": "Why this video helps with this repair"
    }
  ]
}

CRITICAL REQUIREMENTS FOR PRODUCT RECOMMENDATIONS:
- partsList: Recommend REAL, SPECIFIC products with brand names and model numbers when possible
  - Good: "Fluidmaster 400A Fill Valve", "Korky 528 Tank-to-Bowl Gasket"
  - Bad: "Fill valve", "Gasket"
- searchTerms: Include brand, model, and descriptive keywords optimized for Amazon/Home Depot search
- toolsList: Recommend specific brands/models for tools when the job requires quality tools
  - For basic tools (screwdrivers, pliers): recommend trusted brands like Klein, Channellock, Craftsman
  - For specialty tools: be very specific about size and type
- estimatedCost: Provide realistic price ranges based on current retail prices
- This is a PAID service - users expect actionable shopping recommendations they can click and buy`;

    // Build the content array with text and media
    const contentParts: any[] = [{ text: promptText }];

    // Add image if provided
    if (request.imageUri) {
      const imagePart = await fileToGenerativePart(request.imageUri, 'image/jpeg');
      contentParts.push(imagePart);
    }

    // Add video if provided
    if (request.videoUri) {
      const videoPart = await fileToGenerativePart(request.videoUri, 'video/mp4');
      contentParts.push(videoPart);
    }

    console.log('Calling Gemini API for advanced diagnosis...');
    const result = await model.generateContent(contentParts);
    console.log('Gemini API responded');

    const response = await result.response;
    const text = response.text();
    console.log('Response text length:', text.length);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response. First 500 chars:', text.substring(0, 500));
      throw new Error('Invalid response format from AI');
    }

    const diagnosis = JSON.parse(jsonMatch[0]);
    console.log('Advanced diagnosis parsed successfully');
    return diagnosis;
  } catch (error) {
    console.error('Error getting advanced diagnosis:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to get detailed analysis: ${error.message}`);
    }
    throw new Error('Failed to get detailed analysis. Please try again.');
  }
}
