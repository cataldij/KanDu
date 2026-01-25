/**
 * Create the 'images' storage bucket in Supabase
 *
 * Usage:
 * 1. Get your service role key from Supabase Dashboard → Settings → API
 * 2. Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-storage-bucket.js
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fxqhpcmxektbinpizpmw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('');
  console.error('Get it from: Supabase Dashboard → Settings → API → service_role (secret)');
  console.error('');
  console.error('Then run:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-storage-bucket.js');
  process.exit(1);
}

async function createBucket() {
  console.log('Creating storage bucket "images"...');

  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      id: 'images',
      name: 'images',
      public: true,
      file_size_limit: 52428800, // 50MB
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    }),
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Bucket created successfully!', data);
  } else if (response.status === 400) {
    const error = await response.json();
    if (error.message?.includes('already exists')) {
      console.log('✅ Bucket "images" already exists');
    } else {
      console.error('❌ Error:', error);
    }
  } else {
    const error = await response.text();
    console.error('❌ Error creating bucket:', response.status, error);
  }
}

createBucket();
