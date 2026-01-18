# KanDu Supabase Backend Setup Guide

This guide walks you through setting up the complete Supabase backend for KanDu, including Edge Functions, database schema, and security configuration.

## Overview

KanDu uses Supabase as a complete backend solution:

- **Edge Functions**: Secure API gateway for Gemini AI, Google Places, and Stripe
- **PostgreSQL Database**: User data, diagnoses, payments, and rate limiting
- **Row Level Security (RLS)**: Users can only access their own data
- **Authentication**: Email/password and OAuth

## Prerequisites

1. A [Supabase](https://supabase.com) account (free tier works)
2. [Supabase CLI](https://supabase.com/docs/guides/cli) installed
3. [Deno](https://deno.land/) installed (for local Edge Function testing)
4. API keys for:
   - Google AI Studio (Gemini)
   - Google Cloud Console (Places API)
   - Stripe (when ready for payments)

## Step 1: Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (using scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm (all platforms)
npm install -g supabase
```

## Step 2: Link Your Project

```bash
# Login to Supabase
supabase login

# Link to your existing project
cd kandu-fresh
supabase link --project-ref fxqhpcmxektbinpizpmw
```

## Step 3: Run Database Migrations

Apply the database schema with tables, RLS policies, and functions:

```bash
# Push migrations to your Supabase project
supabase db push

# Or run the SQL manually in Supabase Dashboard > SQL Editor
# Copy contents of: supabase/migrations/001_initial_schema.sql
```

This creates:
- `profiles` - User profiles with Stripe customer IDs
- `diagnoses` - Diagnosis history with full RLS
- `api_usage` - Rate limiting tracking
- `payments` - Payment records
- `user_credits` - Prepaid credits system
- Helper functions for rate limiting and credit management

## Step 4: Set Edge Function Secrets

**IMPORTANT**: These secrets keep your API keys secure on the server.

```bash
# Set Gemini API key
supabase secrets set GEMINI_API_KEY=your-gemini-api-key

# Set Google Places API key
supabase secrets set GOOGLE_PLACES_API_KEY=your-google-places-api-key

# Set Stripe keys (when ready for payments)
supabase secrets set STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

To verify secrets are set:
```bash
supabase secrets list
```

## Step 5: Deploy Edge Functions

```bash
# Deploy all Edge Functions
supabase functions deploy diagnose
supabase functions deploy diagnose-advanced
supabase functions deploy local-pros
supabase functions deploy guided-fix
supabase functions deploy repair-plan
supabase functions deploy create-payment
supabase functions deploy stripe-webhook

# Or deploy all at once
supabase functions deploy
```

## Step 6: Configure Stripe Webhook (When Ready)

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://fxqhpcmxektbinpizpmw.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copy the signing secret and set it:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
   ```

## Step 7: Update Your .env File

Your app only needs the public Supabase keys now:

```env
EXPO_PUBLIC_SUPABASE_URL=https://fxqhpcmxektbinpizpmw.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Affiliate IDs for parts links
EXPO_PUBLIC_AMAZON_AFFILIATE_ID=kandu-20
```

**Remove these from .env** (they're now in Supabase secrets):
- ~~EXPO_PUBLIC_GEMINI_API_KEY~~
- ~~EXPO_PUBLIC_GOOGLE_PLACES_API_KEY~~

## Step 8: Rotate Your Old API Keys

Since your old keys were exposed in the client, you should rotate them:

1. **Gemini API Key**:
   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Delete the old key
   - Create a new key
   - Update Supabase secret: `supabase secrets set GEMINI_API_KEY=new-key`

2. **Google Places API Key**:
   - Go to [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)
   - Delete the old key
   - Create a new key with restrictions
   - Update Supabase secret: `supabase secrets set GOOGLE_PLACES_API_KEY=new-key`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Auth       │  │  Database    │  │   Secrets    │          │
│  │  (Users)     │  │ (PostgreSQL) │  │  (API Keys)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Edge Functions                        │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │diagnose │  │local-   │  │guided-  │  │create-  │    │   │
│  │  │         │  │pros     │  │fix      │  │payment  │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  │       │            │            │            │          │   │
│  │       ▼            ▼            ▼            ▼          │   │
│  │   [Gemini]    [Places]     [Gemini]     [Stripe]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ JWT Auth
                    ┌─────────┴─────────┐
                    │   KanDu Mobile    │
                    │   (Expo App)      │
                    └───────────────────┘
```

## Edge Functions Reference

| Function | Endpoint | Description | Rate Limit |
|----------|----------|-------------|------------|
| `diagnose` | POST /functions/v1/diagnose | Free AI diagnosis | 10/day |
| `diagnose-advanced` | POST /functions/v1/diagnose-advanced | Paid detailed diagnosis | 20/day |
| `local-pros` | POST /functions/v1/local-pros | Find local service providers | 50/day |
| `guided-fix` | POST /functions/v1/guided-fix | Real-time repair guidance | 100/hour |
| `repair-plan` | POST /functions/v1/repair-plan | Generate repair steps | 20/day |
| `create-payment` | POST /functions/v1/create-payment | Create Stripe payment | N/A |
| `stripe-webhook` | POST /functions/v1/stripe-webhook | Handle Stripe events | N/A |

## Database Tables

| Table | Description | RLS |
|-------|-------------|-----|
| `profiles` | User profiles, Stripe customer IDs | Users own data |
| `diagnoses` | Diagnosis history | Users own data |
| `api_usage` | Rate limit tracking | Users own data |
| `payments` | Payment records | Users read, service writes |
| `user_credits` | Prepaid credits | Users read, service writes |

## Rate Limiting

Rate limits are enforced in Edge Functions using the `api_usage` table:

- **Free Diagnosis**: 10 per day
- **Advanced Diagnosis**: 20 per day
- **Local Pros Search**: 50 per day
- **Guided Fix Frames**: 100 per hour
- **Repair Plans**: 20 per day

Users see remaining quota in API responses.

## Local Development

To test Edge Functions locally:

```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve

# Test a function
curl -X POST http://localhost:54321/functions/v1/diagnose \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category": "plumbing", "description": "leaky faucet", "imageBase64": "..."}'
```

## Troubleshooting

### "Function not found" error
- Run `supabase functions deploy` to deploy functions
- Check function names match exactly

### "Unauthorized" error
- Ensure user is logged in
- Check JWT token is being sent

### "Rate limit exceeded"
- Wait for rate limit window to reset
- Check `api_usage` table for current usage

### "Service configuration error"
- Verify secrets are set: `supabase secrets list`
- Redeploy functions after setting secrets

## Security Checklist

- [ ] Old API keys rotated
- [ ] GEMINI_API_KEY in Supabase secrets
- [ ] GOOGLE_PLACES_API_KEY in Supabase secrets
- [ ] STRIPE_SECRET_KEY in Supabase secrets
- [ ] STRIPE_WEBHOOK_SECRET in Supabase secrets
- [ ] .env file only contains public keys
- [ ] .env is in .gitignore
- [ ] RLS enabled on all tables
- [ ] Database migration applied

## Next Steps

1. Deploy Edge Functions to production
2. Set production API keys as secrets
3. Configure Stripe webhook for payments
4. Set up error monitoring (Sentry)
5. Add Google Places API restrictions in Google Cloud Console
