-- Migration: Add zones for shared pathways in guest kits
-- Zones allow multiple items to share the same navigation pathway

-- Create zones table
CREATE TABLE IF NOT EXISTS guest_kit_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id UUID NOT NULL REFERENCES guest_kits(id) ON DELETE CASCADE,

  -- Zone identification
  name TEXT NOT NULL, -- "Basement", "Garage", "Utility Room"
  zone_type TEXT NOT NULL DEFAULT 'custom', -- basement, garage, utility_room, laundry, bedroom, outdoor, custom
  icon_name TEXT DEFAULT 'location',

  -- Zone 360° scan (like kitchen home base)
  zone_images JSONB DEFAULT '[]', -- Array of {url, angle, description}
  zone_scan_complete BOOLEAN DEFAULT false,
  zone_description TEXT, -- "Main basement area near stairs"

  -- Pathway from kitchen to this zone
  pathway_images JSONB DEFAULT '[]', -- Array of {url, sequence, label, description}
  pathway_complete BOOLEAN DEFAULT false,
  pathway_description TEXT, -- "Through hallway, down stairs"

  -- Ordering
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add zone_id to guest_kit_items
ALTER TABLE guest_kit_items
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES guest_kit_zones(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_guest_kit_zones_kit_id ON guest_kit_zones(kit_id);
CREATE INDEX IF NOT EXISTS idx_guest_kit_items_zone_id ON guest_kit_items(zone_id);

-- RLS policies for zones
ALTER TABLE guest_kit_zones ENABLE ROW LEVEL SECURITY;

-- Users can view zones for kits they own
CREATE POLICY "Users can view own kit zones"
  ON guest_kit_zones FOR SELECT
  USING (
    kit_id IN (
      SELECT id FROM guest_kits WHERE user_id = auth.uid()
    )
  );

-- Users can insert zones for kits they own
CREATE POLICY "Users can insert own kit zones"
  ON guest_kit_zones FOR INSERT
  WITH CHECK (
    kit_id IN (
      SELECT id FROM guest_kits WHERE user_id = auth.uid()
    )
  );

-- Users can update zones for kits they own
CREATE POLICY "Users can update own kit zones"
  ON guest_kit_zones FOR UPDATE
  USING (
    kit_id IN (
      SELECT id FROM guest_kits WHERE user_id = auth.uid()
    )
  );

-- Users can delete zones for kits they own
CREATE POLICY "Users can delete own kit zones"
  ON guest_kit_zones FOR DELETE
  USING (
    kit_id IN (
      SELECT id FROM guest_kits WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_guest_kit_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guest_kit_zones_updated_at
  BEFORE UPDATE ON guest_kit_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_guest_kit_zones_updated_at();

-- Common zone types for quick setup
COMMENT ON TABLE guest_kit_zones IS 'Zones represent areas in the home where safety items are located. Multiple items can share a zone pathway.';
