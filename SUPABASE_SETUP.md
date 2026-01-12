# Supabase Setup Guide for KanDu

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click "New project"
3. Choose your organization
4. Enter project details:
   - **Name:** KanDu (or your preferred name)
   - **Database Password:** Create a strong password (save this!)
   - **Region:** Choose the closest to your users
5. Click "Create new project" and wait for setup (~2 minutes)

## Step 2: Get Your API Keys

1. Once your project is ready, go to **Settings** > **API**
2. Copy these values to your `.env` file:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Your `.env` should look like:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Create the Database Tables

Go to **SQL Editor** in your Supabase dashboard and run this SQL:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create diagnoses table (to save user diagnosis history)
CREATE TABLE diagnoses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  diagnosis_data JSONB NOT NULL,
  is_advanced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create policies for diagnoses
CREATE POLICY "Users can view their own diagnoses"
  ON diagnoses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own diagnoses"
  ON diagnoses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own diagnoses"
  ON diagnoses FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX diagnoses_user_id_idx ON diagnoses(user_id);
CREATE INDEX diagnoses_created_at_idx ON diagnoses(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Step 4: Configure Authentication

1. Go to **Authentication** > **Providers**
2. Make sure **Email** is enabled
3. Optional: Configure email templates in **Authentication** > **Email Templates**
4. Optional: Enable other providers (Google, Apple, etc.)

### Recommended Email Settings:
- Go to **Authentication** > **Settings**
- Set "Confirm email" to your preference:
  - **ON**: Users must verify email before signing in (more secure)
  - **OFF**: Users can sign in immediately (easier for testing)

## Step 5: Test Your Setup

1. Restart your Expo app (the env variables need to reload)
2. Try creating an account
3. Check the Supabase **Table Editor** to see if your profile was created

## Troubleshooting

### "Supabase credentials not found"
- Make sure your `.env` file has the correct values
- Restart your Expo dev server

### "Email not confirmed"
- Check your email for the confirmation link
- Or disable email confirmation in Supabase Auth settings

### Profile not created after signup
- Check the SQL Editor for any errors
- Verify RLS policies are correct
- Check the Supabase logs in your dashboard

## Optional: Add Social Login

To add Google, Apple, or other social logins:
1. Go to **Authentication** > **Providers**
2. Enable the provider you want
3. Follow Supabase's guide for each provider
4. Update the AuthContext to handle social auth
