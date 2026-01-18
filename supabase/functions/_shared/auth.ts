/**
 * Authentication utilities for Edge Functions
 * Verifies JWT tokens and extracts user info
 */

import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { corsHeaders } from './cors.ts';

export interface AuthResult {
  user: User | null;
  error: string | null;
  supabase: SupabaseClient;
}

/**
 * Verify the authorization header and return the authenticated user
 * Returns null user if authentication fails
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    return { user: null, error: 'Missing authorization header', supabase };
  }

  // Create Supabase client with the user's auth token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  // Get the authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid or expired token', supabase };
  }

  return { user, error: null, supabase };
}

/**
 * Return an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Return a rate limit exceeded response
 */
export function rateLimitResponse(message: string = 'Rate limit exceeded'): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Return an error response
 */
export function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Return a success response
 */
export function successResponse(data: unknown): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
