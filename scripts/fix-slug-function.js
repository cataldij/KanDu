/**
 * Fix the slug generation function via Supabase
 * Run with: node scripts/fix-slug-function.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fxqhpcmxektbinpizpmw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('');
  console.error('Run with:');
  console.error('  set SUPABASE_SERVICE_ROLE_KEY=your_key && node scripts/fix-slug-function.js');
  console.error('');
  console.error('Get the key from: https://supabase.com/dashboard/project/fxqhpcmxektbinpizpmw/settings/api');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

const fixSQL = `
CREATE OR REPLACE FUNCTION generate_guest_kit_slug(base_name TEXT)
RETURNS TEXT AS $$
DECLARE
  result_slug TEXT;
  counter INT := 0;
BEGIN
  result_slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9\\s-]', '', 'g'));
  result_slug := regexp_replace(result_slug, '\\s+', '-', 'g');
  result_slug := regexp_replace(result_slug, '-+', '-', 'g');
  result_slug := trim(both '-' from result_slug);

  WHILE EXISTS (
    SELECT 1 FROM guest_kits
    WHERE guest_kits.slug = result_slug || CASE WHEN counter > 0 THEN '-' || counter ELSE '' END
  ) LOOP
    counter := counter + 1;
  END LOOP;

  IF counter > 0 THEN
    result_slug := result_slug || '-' || counter;
  END IF;

  RETURN result_slug;
END;
$$ LANGUAGE plpgsql;
`;

async function fixFunction() {
  console.log('Fixing slug generation function...');

  // Use the rpc to execute raw SQL (this requires a helper function)
  // Since we can't execute raw SQL directly, we'll test by calling the function

  // First, let's test if the function exists and works
  const { data, error } = await supabase.rpc('generate_guest_kit_slug', {
    base_name: 'Test Home'
  });

  if (error) {
    console.error('Function still broken:', error.message);
    console.error('');
    console.error('You need to run this SQL manually in the Supabase SQL Editor:');
    console.error('https://supabase.com/dashboard/project/fxqhpcmxektbinpizpmw/sql/new');
    console.error('');
    console.error(fixSQL);
  } else {
    console.log('Function works! Generated slug:', data);
  }
}

fixFunction();
