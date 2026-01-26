import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Extract file path from a Supabase storage public URL
 * e.g., "https://xxx.supabase.co/storage/v1/object/public/images/guest-kits/file.jpg"
 * returns "guest-kits/file.jpg"
 */
export function extractStoragePath(publicUrl: string): string | null {
  if (!publicUrl) return null;

  // Match pattern: /storage/v1/object/public/{bucket}/{path}
  const match = publicUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (match) {
    return match[2]; // Return the path after the bucket name
  }
  return null;
}

/**
 * Get a signed URL for a Supabase storage file
 * Works better with React Native's Image component on mobile
 */
export async function getSignedImageUrl(
  publicUrl: string,
  expiresIn = 3600 // 1 hour default
): Promise<string | null> {
  if (!publicUrl) return null;

  const path = extractStoragePath(publicUrl);
  if (!path) {
    console.warn('[getSignedImageUrl] Could not extract path from:', publicUrl);
    return publicUrl; // Fall back to original URL
  }

  const { data, error } = await supabase.storage
    .from('images')
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('[getSignedImageUrl] Error creating signed URL:', error);
    return publicUrl; // Fall back to original URL
  }

  return data.signedUrl;
}
