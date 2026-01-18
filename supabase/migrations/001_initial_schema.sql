-- KanDu Database Schema
-- This migration sets up all tables, RLS policies, and functions
-- Run this in your Supabase SQL Editor

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Index for stripe customer lookups
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx ON profiles(stripe_customer_id);

-- ============================================
-- DIAGNOSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  diagnosis_data JSONB NOT NULL,
  is_advanced BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'watching', 'resolved')),
  resolution_note TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  follow_up_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for diagnoses
DROP POLICY IF EXISTS "Users can view their own diagnoses" ON diagnoses;
CREATE POLICY "Users can view their own diagnoses"
  ON diagnoses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own diagnoses" ON diagnoses;
CREATE POLICY "Users can insert their own diagnoses"
  ON diagnoses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own diagnoses" ON diagnoses;
CREATE POLICY "Users can update their own diagnoses"
  ON diagnoses FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own diagnoses" ON diagnoses;
CREATE POLICY "Users can delete their own diagnoses"
  ON diagnoses FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for diagnoses
CREATE INDEX IF NOT EXISTS diagnoses_user_id_idx ON diagnoses(user_id);
CREATE INDEX IF NOT EXISTS diagnoses_created_at_idx ON diagnoses(created_at DESC);
CREATE INDEX IF NOT EXISTS diagnoses_status_idx ON diagnoses(status);
CREATE INDEX IF NOT EXISTS diagnoses_follow_up_idx ON diagnoses(user_id, status, follow_up_at)
  WHERE status != 'resolved';

-- ============================================
-- API USAGE TABLE (Rate Limiting)
-- ============================================

CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_usage
DROP POLICY IF EXISTS "Users can view their own usage" ON api_usage;
CREATE POLICY "Users can view their own usage"
  ON api_usage FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own usage" ON api_usage;
CREATE POLICY "Users can insert their own usage"
  ON api_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for efficient rate limit queries
CREATE INDEX IF NOT EXISTS api_usage_user_endpoint_idx ON api_usage(user_id, endpoint);
CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_rate_limit_idx ON api_usage(user_id, endpoint, created_at DESC);

-- ============================================
-- PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  product_type TEXT NOT NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  error_message TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payments
DROP POLICY IF EXISTS "Users can view their own payments" ON payments;
CREATE POLICY "Users can view their own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Only Edge Functions (with service role) can insert/update payments
DROP POLICY IF EXISTS "Service role can manage payments" ON payments;
CREATE POLICY "Service role can manage payments"
  ON payments FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for payments
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_stripe_intent_idx ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);

-- ============================================
-- USER CREDITS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credit_type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, credit_type)
);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_credits
DROP POLICY IF EXISTS "Users can view their own credits" ON user_credits;
CREATE POLICY "Users can view their own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Only Edge Functions (with service role) can modify credits
DROP POLICY IF EXISTS "Service role can manage credits" ON user_credits;
CREATE POLICY "Service role can manage credits"
  ON user_credits FOR ALL
  USING (auth.role() = 'service_role');

-- Index for credits
CREATE INDEX IF NOT EXISTS user_credits_user_type_idx ON user_credits(user_id, credit_type);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_credits
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to increment user credits
CREATE OR REPLACE FUNCTION increment_credits(
  p_user_id UUID,
  p_credit_type TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_credits (user_id, credit_type, amount)
  VALUES (p_user_id, p_credit_type, p_amount)
  ON CONFLICT (user_id, credit_type)
  DO UPDATE SET
    amount = user_credits.amount + p_amount,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement user credits (returns false if insufficient)
CREATE OR REPLACE FUNCTION use_credit(
  p_user_id UUID,
  p_credit_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  current_amount INTEGER;
BEGIN
  SELECT amount INTO current_amount
  FROM user_credits
  WHERE user_id = p_user_id AND credit_type = p_credit_type;

  IF current_amount IS NULL OR current_amount < 1 THEN
    RETURN FALSE;
  END IF;

  UPDATE user_credits
  SET amount = amount - 1, updated_at = NOW()
  WHERE user_id = p_user_id AND credit_type = p_credit_type;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's daily usage count for an endpoint
CREATE OR REPLACE FUNCTION get_daily_usage_count(
  p_user_id UUID,
  p_endpoint TEXT
)
RETURNS INTEGER AS $$
DECLARE
  usage_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO usage_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at > NOW() - INTERVAL '24 hours';

  RETURN COALESCE(usage_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old api_usage records (run via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_old_usage()
RETURNS void AS $$
BEGIN
  DELETE FROM api_usage
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- GRANTS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table permissions
GRANT SELECT ON profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON diagnoses TO authenticated;

GRANT SELECT, INSERT ON api_usage TO authenticated;

GRANT SELECT ON payments TO authenticated;

GRANT SELECT ON user_credits TO authenticated;

-- Grant function permissions
GRANT EXECUTE ON FUNCTION get_daily_usage_count TO authenticated;
