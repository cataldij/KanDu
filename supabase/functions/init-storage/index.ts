/**
 * Initialize Storage Buckets
 * One-time setup function to create required storage buckets
 *
 * Call: POST /functions/v1/init-storage
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const BUCKETS = [
  {
    name: 'images',
    options: {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
  },
  {
    name: 'guest-kit-images',
    options: {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
  },
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: { bucket: string; status: string; error?: string }[] = [];

    // List existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return new Response(JSON.stringify({ error: 'Failed to list buckets', details: listError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Existing buckets:', existingBuckets?.map(b => b.name));

    for (const bucket of BUCKETS) {
      const exists = existingBuckets?.some(b => b.name === bucket.name);

      if (exists) {
        results.push({ bucket: bucket.name, status: 'already_exists' });
        console.log(`Bucket '${bucket.name}' already exists`);
      } else {
        console.log(`Creating bucket '${bucket.name}'...`);
        const { error: createError } = await supabase.storage.createBucket(bucket.name, bucket.options);

        if (createError) {
          if (createError.message?.includes('already exists')) {
            results.push({ bucket: bucket.name, status: 'already_exists' });
          } else {
            results.push({ bucket: bucket.name, status: 'error', error: createError.message });
            console.error(`Error creating bucket '${bucket.name}':`, createError);
          }
        } else {
          results.push({ bucket: bucket.name, status: 'created' });
          console.log(`Bucket '${bucket.name}' created successfully`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Init storage error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
