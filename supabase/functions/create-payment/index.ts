/**
 * Create Payment Edge Function
 * Creates Stripe payment intents for advanced diagnosis purchases
 *
 * POST /functions/v1/create-payment
 * Body: { productType: 'advanced_diagnosis' | 'expert_session' }
 * Returns: { clientSecret, paymentIntentId }
 */

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse } from '../_shared/auth.ts';

// Product pricing (in cents)
const PRODUCTS = {
  advanced_diagnosis: {
    amount: 199, // $1.99
    currency: 'usd',
    description: 'KanDu Advanced Diagnosis - Detailed repair guide',
  },
  expert_session_15: {
    amount: 1500, // $15.00
    currency: 'usd',
    description: 'KanDu Expert Video Session - 15 minutes',
  },
  expert_session_30: {
    amount: 2500, // $25.00
    currency: 'usd',
    description: 'KanDu Expert Video Session - 30 minutes',
  },
} as const;

type ProductType = keyof typeof PRODUCTS;

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    // Get Stripe secret key from environment
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not configured');
      return errorResponse('Payment service not configured', 500);
    }

    // Parse request body
    const body = await req.json();
    const { productType, metadata = {} } = body;

    // Validate product type
    if (!productType || !(productType in PRODUCTS)) {
      return errorResponse(`Invalid product type. Must be one of: ${Object.keys(PRODUCTS).join(', ')}`, 400);
    }

    const product = PRODUCTS[productType as ProductType];

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      customer: customerId,
      description: product.description,
      metadata: {
        user_id: user.id,
        product_type: productType,
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Record pending payment in database
    await supabase.from('payments').insert({
      user_id: user.id,
      stripe_payment_intent_id: paymentIntent.id,
      product_type: productType,
      amount: product.amount,
      currency: product.currency,
      status: 'pending',
    });

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: product.amount,
        currency: product.currency,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Create payment error:', err);

    const message = err instanceof Error ? err.message : 'Unknown error';

    // Handle Stripe-specific errors
    if (message.includes('Invalid API Key')) {
      return errorResponse('Payment service configuration error', 500);
    }

    return errorResponse('Failed to create payment', 500);
  }
});
