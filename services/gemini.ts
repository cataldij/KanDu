/**
 * Gemini AI Service
 * VERSION: 2025-01-17-v3 (expo-file-system/legacy import for SDK 54)
 *
 * SECURITY UPDATE: This module now uses Supabase Edge Functions
 * instead of calling Gemini directly. API keys are kept server-side.
 *
 * The old direct API calls have been removed for security.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as api from './api';
import { Platform } from 'react-native';

// Re-export types from api.ts for backwards compatibility
export type { FreeDiagnosis, AdvancedDiagnosis } from './api';

// Extended request type that accepts URIs (for backwards compatibility with screens)
export interface DiagnosisRequest {
  category: string;
  description: string;
  imageUri?: string;
  videoUri?: string;
  imageBase64?: string;
  videoBase64?: string;
}

/**
 * Convert a file URI to base64 using expo-file-system legacy API
 * This is more reliable than the new File API for various URI schemes
 */
async function uriToBase64(uri: string): Promise<string> {
  try {
    console.log('[uriToBase64] VERSION: 2025-01-17-v3 (expo-file-system/legacy)');
    console.log('[uriToBase64] Starting conversion for URI:', uri.substring(0, 80));

    let readableUri = uri;

    // For iOS ph:// or assets-library:// URIs, copy to cache first
    if (Platform.OS === 'ios' && (uri.startsWith('ph://') || uri.startsWith('assets-library://'))) {
      console.log('[uriToBase64] iOS special URI, copying to cache...');
      const isVideo = uri.toLowerCase().includes('video') || uri.includes('mov') || uri.includes('mp4');
      const extension = isVideo ? 'mp4' : 'jpg';
      const filename = `media_${Date.now()}.${extension}`;
      const destUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.copyAsync({ from: uri, to: destUri });
      console.log('[uriToBase64] Copied to:', destUri);
      readableUri = destUri;
    }

    // For Android content:// URIs, copy to cache first
    if (Platform.OS === 'android' && uri.startsWith('content://')) {
      console.log('[uriToBase64] Android content URI, copying to cache...');
      const isVideo = uri.includes('video');
      const extension = isVideo ? 'mp4' : 'jpg';
      const filename = `media_${Date.now()}.${extension}`;
      const destUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.copyAsync({ from: uri, to: destUri });
      console.log('[uriToBase64] Copied to:', destUri);
      readableUri = destUri;
    }

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(readableUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('[uriToBase64] Successfully converted, base64 length:', base64.length);
    return base64;

  } catch (error) {
    console.error('[uriToBase64] Error converting URI to base64:', error);
    console.error('[uriToBase64] Original URI:', uri);

    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Provide specific error messages
    if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
      throw new Error('Media file not found. Please try selecting again.');
    }
    if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
      throw new Error('Permission denied. Please allow access to photos in Settings.');
    }
    if (errorMsg.includes('deprecated') || errorMsg.includes('getInfoAsync')) {
      // If legacy API is also deprecated, try direct read
      console.log('[uriToBase64] Trying direct read as fallback...');
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return base64;
      } catch (fallbackError) {
        throw new Error(`Failed to read file: ${errorMsg}`);
      }
    }

    throw new Error(`Failed to process media file: ${errorMsg}`);
  }
}

/**
 * Get a free diagnosis using Gemini 2.0 Flash (via Edge Function)
 *
 * @param request - The diagnosis request with category, description, and media
 * @returns FreeDiagnosis object with AI analysis
 * @throws Error if the request fails
 */
export async function getFreeDiagnosis(
  request: DiagnosisRequest
): Promise<api.FreeDiagnosis> {
  console.log('[getFreeDiagnosis] Starting diagnosis request...');
  console.log('[getFreeDiagnosis] Category:', request.category);
  console.log('[getFreeDiagnosis] Has imageUri:', !!request.imageUri);
  console.log('[getFreeDiagnosis] Has videoUri:', !!request.videoUri);

  // Convert URIs to base64 if needed
  let imageBase64 = request.imageBase64;
  let videoBase64 = request.videoBase64;

  if (request.imageUri && !imageBase64) {
    console.log('[getFreeDiagnosis] Converting image to base64...');
    imageBase64 = await uriToBase64(request.imageUri);
    console.log('[getFreeDiagnosis] Image converted, size:', imageBase64.length);
  }

  if (request.videoUri && !videoBase64) {
    console.log('[getFreeDiagnosis] Converting video to base64...');
    videoBase64 = await uriToBase64(request.videoUri);
    console.log('[getFreeDiagnosis] Video converted, size:', videoBase64.length);
  }

  console.log('[getFreeDiagnosis] Calling Edge Function...');
  const { data, error } = await api.getFreeDiagnosis({
    category: request.category,
    description: request.description,
    imageBase64,
    videoBase64,
  });

  console.log('[getFreeDiagnosis] Edge Function response received');
  console.log('[getFreeDiagnosis] Has data:', !!data);
  console.log('[getFreeDiagnosis] Has error:', !!error);

  if (error) {
    console.error('[getFreeDiagnosis] Error:', error);

    // Provide user-friendly error messages
    if (error.includes('Rate limit') || error.includes('limit reached')) {
      throw new Error('You\'ve reached your daily diagnosis limit. Please try again tomorrow.');
    }
    if (error.includes('Unauthorized') || error.includes('Authentication')) {
      throw new Error('Please sign in to use the diagnosis feature.');
    }
    if (error.includes('too large')) {
      throw new Error('File too large. Please use a shorter video or smaller image.');
    }

    // Show actual error for debugging
    throw new Error(`Diagnosis failed: ${error}`);
  }

  if (!data) {
    throw new Error('No diagnosis data received. Please try again.');
  }

  return data;
}

/**
 * Get an advanced diagnosis using Gemini Pro (via Edge Function)
 * This is a paid feature ($1.99)
 *
 * @param request - The diagnosis request with category, description, and media
 * @param paymentIntentId - Optional Stripe payment intent ID
 * @returns AdvancedDiagnosis object with detailed AI analysis
 * @throws Error if the request fails
 */
export async function getAdvancedDiagnosis(
  request: DiagnosisRequest,
  paymentIntentId?: string
): Promise<api.AdvancedDiagnosis> {
  // Convert URIs to base64 if needed
  let imageBase64 = request.imageBase64;
  let videoBase64 = request.videoBase64;

  if (request.imageUri && !imageBase64) {
    imageBase64 = await uriToBase64(request.imageUri);
  }

  if (request.videoUri && !videoBase64) {
    videoBase64 = await uriToBase64(request.videoUri);
  }

  const { data, error } = await api.getAdvancedDiagnosis({
    category: request.category,
    description: request.description,
    imageBase64,
    videoBase64,
    paymentIntentId,
  });

  if (error) {
    console.error('Advanced diagnosis error:', error);

    if (error.includes('Rate limit') || error.includes('limit reached')) {
      throw new Error('You\'ve reached your daily advanced diagnosis limit.');
    }
    if (error.includes('Unauthorized') || error.includes('Authentication')) {
      throw new Error('Please sign in to use the advanced diagnosis feature.');
    }
    if (error.includes('Payment')) {
      throw new Error('Payment required for advanced diagnosis.');
    }

    // Show the actual error for debugging
    throw new Error(`Advanced diagnosis failed: ${error}`);
  }

  if (!data) {
    throw new Error('No diagnosis data received. Please try again.');
  }

  return data;
}

/**
 * Get remaining diagnosis quota for the current user
 */
export async function getDiagnosisQuota(): Promise<{
  free: { used: number; limit: number };
  advanced: { used: number; limit: number };
}> {
  const { data, error } = await api.getUsageStats();

  if (error || !data) {
    // Return defaults if we can't fetch quota
    return {
      free: { used: 0, limit: 10 },
      advanced: { used: 0, limit: 20 },
    };
  }

  return {
    free: {
      used: data.free_diagnosis?.count || 0,
      limit: data.free_diagnosis?.limit || 10,
    },
    advanced: {
      used: data.advanced_diagnosis?.count || 0,
      limit: data.advanced_diagnosis?.limit || 20,
    },
  };
}
