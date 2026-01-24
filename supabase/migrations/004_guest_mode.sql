-- Guest Mode: Home Safety Navigation System
-- Allows homeowners to create shareable guides for babysitters, guests, and Airbnb visitors

-- ============================================
-- GUEST KITS (Main container for a home/property)
-- ============================================
CREATE TABLE IF NOT EXISTS guest_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Link settings
  slug TEXT UNIQUE NOT NULL, -- e.g., 'smith-home' or 'malibu-beach-house'
  kit_type TEXT DEFAULT 'home' CHECK (kit_type IN ('home', 'rental')),

  -- Display info
  display_name TEXT NOT NULL, -- "The Smith Home" or "Malibu Beach House"

  -- Security
  expires_at TIMESTAMPTZ, -- NULL = never expires
  is_active BOOLEAN DEFAULT true,
  access_pin TEXT, -- Optional 4-digit PIN for extra security

  -- Contact info
  homeowner_name TEXT,
  homeowner_phone TEXT,
  show_phone_to_guest BOOLEAN DEFAULT true,

  -- Home base (kitchen anchor point)
  home_base_image_url TEXT,
  home_base_description TEXT DEFAULT 'Kitchen',

  -- Rental-specific fields
  wifi_network TEXT,
  wifi_password TEXT,
  address TEXT,
  show_address BOOLEAN DEFAULT false,
  checkin_time TIME,
  checkout_time TIME,
  checkin_instructions TEXT,
  checkout_instructions TEXT,
  house_rules TEXT,

  -- Branding (for paid tier)
  custom_branding JSONB DEFAULT '{}', -- { logo_url, primary_color, hide_kandu_badge }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GUEST KIT ITEMS (Safety items and destinations)
-- ============================================
CREATE TABLE IF NOT EXISTS guest_kit_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID REFERENCES guest_kits(id) ON DELETE CASCADE NOT NULL,

  -- Item info
  item_type TEXT NOT NULL, -- 'water_shutoff', 'electrical_panel', 'fire_extinguisher', etc.
  custom_name TEXT, -- Optional custom name override
  hint TEXT, -- "Under the kitchen sink, left side"

  -- Photos
  overview_image_url TEXT, -- Wide shot showing general location
  destination_image_url TEXT NOT NULL, -- The actual item
  control_image_url TEXT, -- Close-up of the control (valve, switch, button)

  -- Instructions at destination
  instructions TEXT, -- "Turn the red valve clockwise until it stops"
  warning_text TEXT, -- Safety warnings

  -- Route description (AI-generated or manual)
  route_description TEXT, -- "From the kitchen, turn left at the fridge..."

  -- Categorization
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'important', 'helpful')),
  category TEXT DEFAULT 'safety' CHECK (category IN ('safety', 'utilities', 'appliances', 'info')),

  -- Display
  display_order INT DEFAULT 0,
  icon_name TEXT, -- Ionicons icon name

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GUEST KIT WAYPOINTS (Navigation points along routes)
-- ============================================
CREATE TABLE IF NOT EXISTS guest_kit_waypoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES guest_kit_items(id) ON DELETE CASCADE NOT NULL,

  -- Sequence
  sequence_order INT NOT NULL, -- 1, 2, 3, 4...
  waypoint_type TEXT DEFAULT 'navigation' CHECK (waypoint_type IN ('start', 'navigation', 'destination')),

  -- Visual reference
  reference_image_url TEXT NOT NULL,

  -- Guidance
  instruction TEXT NOT NULL, -- "Head toward the white door near the refrigerator"
  hint TEXT, -- Additional hint if they're stuck
  direction TEXT CHECK (direction IN ('ahead', 'left', 'right', 'up', 'down', 'back')),

  -- For AI matching
  landmarks TEXT, -- "refrigerator, white door, wooden floor"

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GUEST KIT LOCAL RECOMMENDATIONS (For rentals)
-- ============================================
CREATE TABLE IF NOT EXISTS guest_kit_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID REFERENCES guest_kits(id) ON DELETE CASCADE NOT NULL,

  -- Info
  category TEXT NOT NULL CHECK (category IN ('restaurant', 'grocery', 'attraction', 'emergency', 'transport', 'other')),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  google_maps_url TEXT,
  website_url TEXT,
  phone TEXT,
  host_notes TEXT, -- Personal recommendation

  -- Display
  display_order INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GUEST KIT ACCESS LOGS (Analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS guest_kit_access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID REFERENCES guest_kits(id) ON DELETE CASCADE NOT NULL,

  -- Access info
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT, -- Hashed for privacy

  -- What they viewed
  items_viewed TEXT[], -- Array of item IDs viewed
  scans_performed INT DEFAULT 0,

  -- Session info
  session_duration_seconds INT
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_guest_kits_user_id ON guest_kits(user_id);
CREATE INDEX IF NOT EXISTS idx_guest_kits_slug ON guest_kits(slug);
CREATE INDEX IF NOT EXISTS idx_guest_kits_active ON guest_kits(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_guest_kit_items_kit_id ON guest_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS idx_guest_kit_items_type ON guest_kit_items(item_type);
CREATE INDEX IF NOT EXISTS idx_guest_kit_waypoints_item_id ON guest_kit_waypoints(item_id);
CREATE INDEX IF NOT EXISTS idx_guest_kit_access_logs_kit_id ON guest_kit_access_logs(kit_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE guest_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_kit_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_kit_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_kit_access_logs ENABLE ROW LEVEL SECURITY;

-- Guest Kits: Users can manage their own kits
CREATE POLICY "Users can view their own guest kits"
  ON guest_kits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create guest kits"
  ON guest_kits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own guest kits"
  ON guest_kits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own guest kits"
  ON guest_kits FOR DELETE
  USING (auth.uid() = user_id);

-- Guest Kit Items: Users can manage items in their kits
CREATE POLICY "Users can view items in their kits"
  ON guest_kit_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_items.kit_id AND guest_kits.user_id = auth.uid()
  ));

CREATE POLICY "Users can create items in their kits"
  ON guest_kit_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_items.kit_id AND guest_kits.user_id = auth.uid()
  ));

CREATE POLICY "Users can update items in their kits"
  ON guest_kit_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_items.kit_id AND guest_kits.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete items in their kits"
  ON guest_kit_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_items.kit_id AND guest_kits.user_id = auth.uid()
  ));

-- Waypoints: Same pattern
CREATE POLICY "Users can view waypoints in their items"
  ON guest_kit_waypoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM guest_kit_items
    JOIN guest_kits ON guest_kits.id = guest_kit_items.kit_id
    WHERE guest_kit_items.id = guest_kit_waypoints.item_id AND guest_kits.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage waypoints in their items"
  ON guest_kit_waypoints FOR ALL
  USING (EXISTS (
    SELECT 1 FROM guest_kit_items
    JOIN guest_kits ON guest_kits.id = guest_kit_items.kit_id
    WHERE guest_kit_items.id = guest_kit_waypoints.item_id AND guest_kits.user_id = auth.uid()
  ));

-- Recommendations: Same pattern
CREATE POLICY "Users can manage recommendations in their kits"
  ON guest_kit_recommendations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_recommendations.kit_id AND guest_kits.user_id = auth.uid()
  ));

-- Access Logs: Users can view logs for their kits, service role can write
CREATE POLICY "Users can view access logs for their kits"
  ON guest_kit_access_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM guest_kits WHERE guest_kits.id = guest_kit_access_logs.kit_id AND guest_kits.user_id = auth.uid()
  ));

CREATE POLICY "Service role can insert access logs"
  ON guest_kit_access_logs FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS anyway

-- ============================================
-- PUBLIC ACCESS POLICY FOR GUESTS (via slug)
-- ============================================
-- Guests need to access kits by slug without authentication
-- We'll handle this via edge function with service role

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate unique slug
CREATE OR REPLACE FUNCTION generate_guest_kit_slug(base_name TEXT)
RETURNS TEXT AS $$
DECLARE
  slug TEXT;
  counter INT := 0;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  slug := regexp_replace(slug, '\s+', '-', 'g');
  slug := regexp_replace(slug, '-+', '-', 'g');
  slug := trim(both '-' from slug);

  -- If slug exists, append number
  WHILE EXISTS (SELECT 1 FROM guest_kits WHERE guest_kits.slug = slug || CASE WHEN counter > 0 THEN '-' || counter ELSE '' END) LOOP
    counter := counter + 1;
  END LOOP;

  IF counter > 0 THEN
    slug := slug || '-' || counter;
  END IF;

  RETURN slug;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_guest_kit_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_guest_kits_timestamp
  BEFORE UPDATE ON guest_kits
  FOR EACH ROW
  EXECUTE FUNCTION update_guest_kit_timestamp();

CREATE TRIGGER update_guest_kit_items_timestamp
  BEFORE UPDATE ON guest_kit_items
  FOR EACH ROW
  EXECUTE FUNCTION update_guest_kit_timestamp();
