-- Article Images Cache Table
-- Stores AI-generated article images to avoid redundant API calls
-- Refreshes once per day

CREATE TABLE IF NOT EXISTS article_images_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL, -- e.g., 'daily_tips_2026-01-20'
  images JSONB NOT NULL, -- Array of { title, searchTerm, thumbnailUrl, fullUrl }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for fast lookups by cache key
CREATE INDEX IF NOT EXISTS idx_article_images_cache_key ON article_images_cache(cache_key);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_article_images_expires ON article_images_cache(expires_at);

-- Enable RLS
ALTER TABLE article_images_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read the cache (it's shared content)
CREATE POLICY "Anyone can read article images cache"
  ON article_images_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update (edge functions use service role)
CREATE POLICY "Service role can manage cache"
  ON article_images_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
