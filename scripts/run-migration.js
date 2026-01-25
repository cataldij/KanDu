// Script to run database migration via Supabase REST API
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables');
  console.error('Please add SUPABASE_SERVICE_ROLE_KEY to your .env file');
  console.error('Get it from: https://supabase.com/dashboard → Settings → API → service_role key');
  process.exit(1);
}

// Extract project ref from URL (e.g., https://abc123.supabase.co -> abc123)
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Invalid Supabase URL format');
  process.exit(1);
}

// Read migration file
const migrationPath = path.join(__dirname, '../supabase/migrations/008_recipe_tracking.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('🔧 Running Recipe Tracking Migration');
console.log('📄 File:', migrationPath);
console.log('🌐 Project:', projectRef);
console.log('');

// Execute SQL via Supabase REST API
const options = {
  hostname: `${projectRef}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/exec',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Prefer': 'return=representation'
  }
};

const postData = JSON.stringify({ query: sql });

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204) {
      console.log('✅ Migration completed successfully!');
      console.log('');
      console.log('Created tables:');
      console.log('  • recipes');
      console.log('  • recipe_ingredients');
      console.log('  • cooking_history');
      console.log('  • ingredient_usage');
      console.log('');
      console.log('Your app is now ready to use recipe tracking! 🎉');
    } else if (res.statusCode === 404) {
      console.log('⚠️  RPC function not available, trying alternative method...');
      console.log('');
      console.log('Please run this SQL manually in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
      console.log('');
      console.log('Copy the SQL from: supabase/migrations/008_recipe_tracking.sql');
    } else {
      console.error('❌ Migration failed');
      console.error('Status:', res.statusCode);
      console.error('Response:', data);
      console.log('');
      console.log('💡 Manual alternative:');
      console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
      console.log('2. Copy SQL from: supabase/migrations/008_recipe_tracking.sql');
      console.log('3. Paste and click "Run"');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error:', e.message);
  console.log('');
  console.log('💡 Manual alternative:');
  console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
  console.log('2. Copy SQL from: supabase/migrations/008_recipe_tracking.sql');
  console.log('3. Paste and click "Run"');
});

req.write(postData);
req.end();
