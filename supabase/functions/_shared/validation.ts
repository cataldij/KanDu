/**
 * Input validation utilities for Edge Functions
 * Prevents malicious input and ensures data integrity
 */

// Maximum sizes for various inputs
// Note: Supabase Edge Functions have ~10MB request body limit
// Base64 encoding adds ~33% overhead
export const MAX_SIZES = {
  DESCRIPTION: 2000,           // Max characters for problem description
  DIAGNOSIS_SUMMARY: 5000,     // Max characters for repair plan diagnosis (includes regeneration context)
  BASE64_IMAGE: 10_000_000,    // ~7.5MB image (base64 is ~33% larger)
  BASE64_VIDEO: 10_000_000,    // ~7.5MB video (must stay under 10MB Edge Function limit)
  CATEGORY: 50,                // Max category length
  SEARCH_QUERY: 200,           // Max search query length
};

// Valid categories
export const VALID_CATEGORIES = [
  'plumbing',
  'electrical',
  'appliances',
  'hvac',
  'automotive',
  'other',
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate diagnosis request payload
 */
export function validateDiagnosisRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { category, description, imageBase64, videoBase64 } = body as Record<string, unknown>;

  // Category validation
  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
    return { valid: false, error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` };
  }

  // Description validation
  if (!description || typeof description !== 'string') {
    return { valid: false, error: 'Description is required' };
  }

  if (description.length > MAX_SIZES.DESCRIPTION) {
    return { valid: false, error: `Description too long. Maximum ${MAX_SIZES.DESCRIPTION} characters.` };
  }

  // Sanitize description - remove potential script injection
  if (/<script|javascript:|on\w+=/i.test(description)) {
    return { valid: false, error: 'Invalid characters in description' };
  }

  // Image validation (optional)
  if (imageBase64) {
    if (typeof imageBase64 !== 'string') {
      return { valid: false, error: 'Invalid image format' };
    }
    if (imageBase64.length > MAX_SIZES.BASE64_IMAGE) {
      return { valid: false, error: 'Image too large. Maximum 15MB.' };
    }
    // Basic base64 validation
    if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64.replace(/\s/g, ''))) {
      return { valid: false, error: 'Invalid base64 image data' };
    }
  }

  // Video validation (optional)
  if (videoBase64) {
    if (typeof videoBase64 !== 'string') {
      return { valid: false, error: 'Invalid video format' };
    }
    if (videoBase64.length > MAX_SIZES.BASE64_VIDEO) {
      return { valid: false, error: 'Video too large. Please use a shorter video (max ~10 seconds).' };
    }
  }

  // Image or video is recommended but not strictly required
  // (user can submit with just a description)

  return { valid: true };
}

/**
 * Validate local pros search request
 */
export function validateLocalProsRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { category, queryText, lat, lng } = body as Record<string, unknown>;

  // Category validation
  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  // Query text validation
  if (queryText && typeof queryText === 'string') {
    if (queryText.length > MAX_SIZES.SEARCH_QUERY) {
      return { valid: false, error: 'Search query too long' };
    }
  }

  // Location validation
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { valid: false, error: 'Valid latitude and longitude are required' };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Invalid latitude' };
  }

  if (lng < -180 || lng > 180) {
    return { valid: false, error: 'Invalid longitude' };
  }

  return { valid: true };
}

/**
 * Validate guided fix request
 */
export function validateGuidedFixRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const {
    imageBase64,
    category,
    problemDescription,
    currentStep,
    totalSteps,
    currentStepInstruction
  } = body as Record<string, unknown>;

  // Required fields
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { valid: false, error: 'Image is required' };
  }

  if (imageBase64.length > MAX_SIZES.BASE64_IMAGE) {
    return { valid: false, error: 'Image too large' };
  }

  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  if (!problemDescription || typeof problemDescription !== 'string') {
    return { valid: false, error: 'Problem description is required' };
  }

  if (typeof currentStep !== 'number' || currentStep < 1) {
    return { valid: false, error: 'Valid current step is required' };
  }

  if (typeof totalSteps !== 'number' || totalSteps < 1) {
    return { valid: false, error: 'Valid total steps is required' };
  }

  if (!currentStepInstruction || typeof currentStepInstruction !== 'string') {
    return { valid: false, error: 'Current step instruction is required' };
  }

  return { valid: true };
}

/**
 * Validate repair plan request
 */
export function validateRepairPlanRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { category, diagnosisSummary } = body as Record<string, unknown>;

  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'Category is required' };
  }

  if (!diagnosisSummary || typeof diagnosisSummary !== 'string') {
    return { valid: false, error: 'Diagnosis summary is required' };
  }

  // Use larger limit for diagnosis summary since regeneration includes context
  if (diagnosisSummary.length > MAX_SIZES.DIAGNOSIS_SUMMARY) {
    return { valid: false, error: 'Diagnosis summary too long' };
  }

  return { valid: true };
}

/**
 * Sanitize a string for safe storage/display
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}
