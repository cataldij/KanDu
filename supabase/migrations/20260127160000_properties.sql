-- Properties: Group guest kits by property (primary home, second home, rental)
-- Only name is required, all other fields optional

-- Create property type enum
DO $$ BEGIN
  CREATE TYPE property_type AS ENUM ('primary_residence', 'second_home', 'rental');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Required
  name TEXT NOT NULL, -- "Beach House", "Downtown Rental"
  property_type property_type NOT NULL DEFAULT 'primary_residence',

  -- Optional location
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,

  -- Optional property photo
  image_url TEXT,

  -- Optional rental info
  rental_platform TEXT, -- 'airbnb', 'vrbo', 'direct', etc.
  property_manager_name TEXT,
  property_manager_phone TEXT,

  -- Optional access codes
  gate_code TEXT,
  garage_code TEXT,
  lockbox_code TEXT,
  alarm_code TEXT,
  wifi_network TEXT,
  wifi_password TEXT,

  -- Optional property details
  parking_instructions TEXT,
  trash_schedule TEXT,
  hoa_rules TEXT,
  emergency_contacts JSONB DEFAULT '[]', -- [{name, phone, role}]

  -- Display order for sorting
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add property_id to guest_kits (optional - for backward compatibility)
ALTER TABLE guest_kits
ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_guest_kits_property_id ON guest_kits(property_id);

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own properties
CREATE POLICY "Users can view own properties"
  ON properties FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own properties"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own properties"
  ON properties FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own properties"
  ON properties FOR DELETE
  USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_properties_updated_at();

-- Comments for documentation
COMMENT ON TABLE properties IS 'User properties - groups guest kits by location (primary home, second home, rentals)';
COMMENT ON COLUMN properties.property_type IS 'Type: primary_residence, second_home, or rental';
COMMENT ON COLUMN properties.rental_platform IS 'Where property is listed: airbnb, vrbo, direct, etc.';
COMMENT ON COLUMN properties.emergency_contacts IS 'Array of {name, phone, role} for property emergencies';
