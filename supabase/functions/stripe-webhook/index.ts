/**
 * Stripe Webhook Edge Function
 * Handles Stripe webhook events for payment confirmations
 *
 * POST /functions/v1/stripe-webhook
 * Body: Stripe webhook payload
 * Headers: stripe-signature
 */

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Get Stripe keys from environment
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error('Stripe keys not configured');
      return new Response('Webhook not configured', { status: 500 });
    }

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get the signature from headers
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }

    // Get raw body for signature verification
    const body = await req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Invalid signature', { status: 400 });
    }

    // Initialize Supabase with service role key (for admin access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Update payment status
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (updateError) {
          console.error('Failed to update payment:', updateError);
        }

        // Grant entitlement based on product type
        const productType = paymentIntent.metadata.product_type;
        const userId = paymentIntent.metadata.user_id;

        if (productType === 'advanced_diagnosis') {
          // Grant one advanced diagnosis credit
          await supabase.from('user_credits').upsert({
            user_id: userId,
            credit_type: 'advanced_diagnosis',
            amount: 1,
          }, {
            onConflict: 'user_id,credit_type',
          });

          // Or increment existing credits
          await supabase.rpc('increment_credits', {
            p_user_id: userId,
            p_credit_type: 'advanced_diagnosis',
            p_amount: 1,
          });
        }

        console.log('Payment succeeded:', paymentIntent.id, productType);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Update payment status
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            error_message: paymentIntent.last_payment_error?.message,
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        console.log('Payment failed:', paymentIntent.id);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Handle subscription changes if you add subscription features later
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription event:', event.type, subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        // Handle subscription cancellation
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', subscription.id);
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Webhook handler failed', { status: 500 });
  }
});
