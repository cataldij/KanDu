/**
 * Initialize Supabase Storage Buckets
 * Run with: node scripts/init-storage.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fxqhpcmxektbinpizpmw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('');
  console.error('Run with:');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="your_key"; node scripts/init-storage.js');
  console.error('');
  console.error('Get the key from: https://supabase.com/dashboard/project/fxqhpcmxektbinpizpmw/settings/api');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

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

async function initStorage() {
  console.log('Initializing Supabase Storage...\n');

  // List existing buckets
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('Error listing buckets:', listError.message);
    process.exit(1);
  }

  console.log('Existing buckets:', existingBuckets?.map(b => b.name).join(', ') || 'none');
  console.log('');

  for (const bucket of BUCKETS) {
    const exists = existingBuckets?.some(b => b.name === bucket.name);

    if (exists) {
      console.log(`✓ Bucket '${bucket.name}' already exists`);
    } else {
      console.log(`Creating bucket '${bucket.name}'...`);
      const { error: createError } = await supabase.storage.createBucket(bucket.name, bucket.options);

      if (createError) {
        if (createError.message?.includes('already exists')) {
          console.log(`✓ Bucket '${bucket.name}' already exists`);
        } else {
          console.error(`✗ Error creating bucket '${bucket.name}':`, createError.message);
        }
      } else {
        console.log(`✓ Bucket '${bucket.name}' created successfully`);
      }
    }
  }

  console.log('\nStorage initialization complete!');
}

initStorage().catch(console.error);
