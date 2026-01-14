import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(API_KEY);

export interface GuidanceRequest {
  imageBase64: string;
  category: string;
  problemDescription: string;
  currentStep: number;
  totalSteps: number;
  currentStepInstruction: string; // The actual step the user should be doing
  stepContext?: string;
  expectedItem?: string; // What item we expect to see (e.g., "2019 Audi A3")
}

// Bounding box for highlighting detected items on screen
export interface BoundingBox {
  label: string; // What this box highlights (e.g., "Hot valve", "P-trap")
  x: number; // Left edge as percentage of image width (0-100)
  y: number; // Top edge as percentage of image height (0-100)
  width: number; // Width as percentage of image width (0-100)
  height: number; // Height as percentage of image height (0-100)
}

export interface GuidanceResponse {
  instruction: string;
  detectedObject?: string;
  confidence: number;
  stepComplete: boolean;
  safetyWarning?: string;
  shouldStop?: boolean;
  wrongItem?: boolean; // True if detected object doesn't match expected item
  detectedItemMismatch?: string; // What was detected instead (e.g., "Ford F-150")
  highlights?: BoundingBox[]; // Items to highlight on screen
}

/**
 * Get real-time guidance from Gemini based on camera frame
 * Uses Gemini 2.5 Flash for fast, cheap responses (~$0.001 per frame)
 */
export async function getRealTimeGuidance(
  request: GuidanceRequest
): Promise<GuidanceResponse> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const promptText = `REAL-TIME REPAIR ASSISTANT - Step ${request.currentStep} of ${request.totalSteps}

You are guiding a user through a repair. Your job is to help them complete the CURRENT STEP.

=== CONTEXT ===
Category: ${request.category}
Problem: ${request.problemDescription}
${request.expectedItem ? `EXPECTED ITEM: ${request.expectedItem} (If you see a DIFFERENT make/model, flag it as wrong item!)` : ''}

=== CURRENT STEP ===
Step ${request.currentStep} of ${request.totalSteps}: "${request.currentStepInstruction}"
${request.stepContext ? `Looking for: ${request.stepContext}` : ''}

=== YOUR TASK ===
1. Look at the camera frame
2. Identify the main object/item visible
3. Check if it matches the expected item (if specified)
4. Guide the user to complete the CURRENT STEP
5. Mark stepComplete=true ONLY when the current step is visually confirmed done

=== WRONG ITEM DETECTION ===
${request.expectedItem ? `The user expects to work on: "${request.expectedItem}"
If you see a DIFFERENT vehicle/appliance (e.g., user expects "Audi A3" but you see a "Ford F-150"), you MUST:
- Set wrongItem: true
- Set detectedItemMismatch: "[what you actually see]"
- Instruction should say: "Hold on - I'm seeing a [detected item], not [expected item]. Point me at the right one."` : 'No specific item expected - just guide through the repair.'}

=== OUTPUT (STRICT JSON) ===
{
  "instruction": "Short guidance for current step (1-2 sentences). Guide them through THIS step, not generic advice.",
  "detectedObject": "Main object visible (e.g., 'Ford F-150 wheel', 'Kitchen sink P-trap')",
  "confidence": 0.0-1.0,
  "stepComplete": true only if THIS step is visually confirmed complete,
  "safetyWarning": null or "URGENT warning if danger detected",
  "shouldStop": false (true only for immediate danger),
  "wrongItem": false (true if detected object doesn't match expected item),
  "detectedItemMismatch": null or "What you see instead of expected item",
  "highlights": [
    {
      "label": "Name of item to highlight (e.g., 'Hot valve', 'P-trap')",
      "x": 0-100 (left edge as % of image width),
      "y": 0-100 (top edge as % of image height),
      "width": 0-100 (box width as % of image),
      "height": 0-100 (box height as % of image)
    }
  ]
}

=== HIGHLIGHTS (IMPORTANT) ===
- ALWAYS include "highlights" array with bounding boxes for key items the user should look at
- Draw boxes around: the item being worked on, tools visible, parts to manipulate, valves, switches, etc.
- Use approximate coordinates as percentages (0-100) of the image dimensions
- Label each highlight clearly (e.g., "Hot water valve", "Drain plug", "Filter cover")
- Include 1-3 highlights per frame, focusing on what's most relevant to the current step
- Example: For "locate hot and cold valves", highlight both valves with labels "Hot" and "Cold"

=== GUIDANCE EXAMPLES ===
Good: "I can see the tire. Now locate the valve stem - it should be a small metal cap."
Good: "Perfect, that's the P-trap. Now place the bucket underneath it."
Good: "Hold on - I'm seeing a Ford wheel, not an Audi A3. Point me at your Audi."
Bad: "Clean the rim" (too vague, doesn't guide through the step)
Bad: "Looking good" (not helpful, doesn't progress the repair)

=== STEP COMPLETION ===
- stepComplete should be TRUE when you can visually confirm the current step is done
- Don't be too strict - if the user has clearly done what the step asks, mark it complete
- This allows the app to automatically advance to the next step`;

    const contentParts = [
      { text: promptText },
      {
        inlineData: {
          data: request.imageBase64,
          mimeType: 'image/jpeg',
        },
      },
    ];

    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const guidance = JSON.parse(jsonMatch[0]);
    return guidance;
  } catch (error) {
    console.error('Error getting real-time guidance:', error);
    throw new Error('Failed to analyze frame. Please try again.');
  }
}

/**
 * Generate step-by-step repair plan from diagnosis
 */
export interface RepairStep {
  stepNumber: number;
  instruction: string;
  safetyNote?: string;
  lookingFor: string; // What AI should look for in camera to confirm step complete
}

export async function generateRepairPlan(
  category: string,
  diagnosisSummary: string,
  likelyCause?: string
): Promise<RepairStep[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const promptText = `GENERATE STEP-BY-STEP REPAIR PLAN

Category: ${category}
Problem: ${diagnosisSummary}
${likelyCause ? `Likely Cause: ${likelyCause}` : ''}

Create a simple, camera-guided repair plan with 3-7 steps.

OUTPUT (STRICT JSON):
{
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "First step instruction (e.g., 'Find the P-trap under your sink')",
      "safetyNote": "Safety note if needed, or null",
      "lookingFor": "What to detect in camera frame (e.g., 'Curved P-trap pipe')"
    },
    {
      "stepNumber": 2,
      "instruction": "...",
      "safetyNote": "...",
      "lookingFor": "..."
    }
  ]
}

REQUIREMENTS:
- Keep instructions SHORT and ACTIONABLE
- Each step should be something AI can visually confirm via camera
- Include safety notes for dangerous steps
- 3-7 steps maximum (this is guided, not comprehensive)
- Steps should flow logically
- Final step should be testing/verification`;

    const result = await model.generateContent([{ text: promptText }]);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const plan = JSON.parse(jsonMatch[0]);
    return plan.steps;
  } catch (error) {
    console.error('Error generating repair plan:', error);
    throw new Error('Failed to generate repair plan. Please try again.');
  }
}
