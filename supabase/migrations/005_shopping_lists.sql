-- Shopping Lists: Aggregate items from fridge scans, guided fixes, and manual entry
-- Supports both grocery lists (from fridge scans) and hardware lists (from repairs)

-- ============================================
-- SHOPPING LISTS (Main container)
-- ============================================
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- List metadata
  name TEXT NOT NULL DEFAULT 'Shopping List',
  list_type TEXT NOT NULL CHECK (list_type IN ('grocery', 'hardware', 'mixed')),

  -- Source tracking (where did this list come from?)
  source_type TEXT CHECK (source_type IN ('fridge_scan', 'pantry_scan', 'guided_fix', 'recipe', 'manual')),
  source_id UUID, -- Reference to the originating scan/repair session
  source_name TEXT, -- Human readable: "Leaky Faucet Repair" or "Tuesday Fridge Scan"

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_archived BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- SHOPPING LIST ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,

  -- Item details
  item_name TEXT NOT NULL,
  quantity TEXT, -- "1 gallon", "2", "1/2 inch", "1 dozen"
  unit TEXT, -- "gallon", "dozen", "pack", "each"

  -- Categorization
  category TEXT, -- "dairy", "produce", "plumbing", "electrical", "tools"
  aisle_hint TEXT, -- "Aisle 5" or "Plumbing section"

  -- Status
  is_checked BOOLEAN DEFAULT false,
  checked_at TIMESTAMPTZ,

  -- Pricing (optional)
  estimated_price DECIMAL(10, 2),
  actual_price DECIMAL(10, 2),

  -- Store info
  store_suggestion TEXT, -- "Home Depot", "Kroger", "Amazon"
  product_url TEXT, -- Deep link to product

  -- Source tracking
  source_step_number INT, -- Which repair step needed this?
  is_tool BOOLEAN DEFAULT false, -- Tool vs consumable material
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'normal', 'optional')),

  -- Notes
  notes TEXT,
  substitute_for TEXT, -- If this replaces something user didn't have

  -- Display
  display_order INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVENTORY ITEMS (Track what user HAS)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Item details
  item_name TEXT NOT NULL,
  category TEXT NOT NULL, -- "refrigerator", "pantry", "toolbox", "garage"

  -- Quantity tracking
  quantity_level TEXT CHECK (quantity_level IN ('full', 'good', 'half', 'low', 'empty', 'unknown')),
  quantity_count INT, -- Exact count if known (e.g., 3 eggs)
  quantity_unit TEXT, -- "eggs", "gallons", "items"

  -- Restock settings
  restock_threshold TEXT DEFAULT 'low', -- When to suggest restocking
  auto_add_to_list BOOLEAN DEFAULT false, -- Automatically add when low?
  preferred_brand TEXT,
  preferred_store TEXT,
  typical_price DECIMAL(10, 2),

  -- Last scan info
  last_scanned_at TIMESTAMPTZ,
  last_scan_image_url TEXT,
  confidence_score DECIMAL(3, 2), -- AI confidence 0.00-1.00

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FRIDGE/PANTRY SCANS (Scan history)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Scan metadata
  scan_type TEXT NOT NULL CHECK (scan_type IN ('refrigerator', 'pantry', 'toolbox', 'garage', 'other')),
  image_url TEXT,

  -- AI analysis results (stored as JSON for flexibility)
  analysis_result JSONB NOT NULL DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "items": [
  --     { "name": "Milk", "quantity_level": "low", "restock": true, "confidence": 0.95 },
  --     { "name": "Eggs", "quantity_count": 3, "quantity_level": "low", "restock": true }
  --   ],
  --   "suggested_shopping_list": ["Milk (1 gallon)", "Eggs (1 dozen)"],
  --   "total_items_detected": 12,
  --   "items_needing_restock": 3
  -- }

  -- Generated shopping list (if user chose to create one)
  generated_list_id UUID REFERENCES shopping_lists(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_active ON shopping_lists(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shopping_lists_type ON shopping_lists(list_type);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON shopping_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_checked ON shopping_list_items(is_checked);
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_level ON inventory_items(quantity_level);
CREATE INDEX IF NOT EXISTS idx_inventory_scans_user_id ON inventory_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_scans_type ON inventory_scans(scan_type);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_scans ENABLE ROW LEVEL SECURITY;

-- Shopping Lists: Users can manage their own lists
CREATE POLICY "Users can view their own shopping lists"
  ON shopping_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create shopping lists"
  ON shopping_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping lists"
  ON shopping_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping lists"
  ON shopping_lists FOR DELETE
  USING (auth.uid() = user_id);

-- Shopping List Items: Users can manage items in their lists
CREATE POLICY "Users can view items in their lists"
  ON shopping_list_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shopping_lists
    WHERE shopping_lists.id = shopping_list_items.list_id
    AND shopping_lists.user_id = auth.uid()
  ));

CREATE POLICY "Users can create items in their lists"
  ON shopping_list_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_lists
    WHERE shopping_lists.id = shopping_list_items.list_id
    AND shopping_lists.user_id = auth.uid()
  ));

CREATE POLICY "Users can update items in their lists"
  ON shopping_list_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists
    WHERE shopping_lists.id = shopping_list_items.list_id
    AND shopping_lists.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete items in their lists"
  ON shopping_list_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists
    WHERE shopping_lists.id = shopping_list_items.list_id
    AND shopping_lists.user_id = auth.uid()
  ));

-- Inventory Items: Users can manage their own inventory
CREATE POLICY "Users can manage their own inventory"
  ON inventory_items FOR ALL
  USING (auth.uid() = user_id);

-- Inventory Scans: Users can manage their own scans
CREATE POLICY "Users can manage their own scans"
  ON inventory_scans FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Update timestamp trigger (reuse existing or create)
CREATE OR REPLACE FUNCTION update_shopping_list_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shopping_lists_timestamp
  BEFORE UPDATE ON shopping_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_shopping_list_timestamp();

CREATE TRIGGER update_shopping_list_items_timestamp
  BEFORE UPDATE ON shopping_list_items
  FOR EACH ROW
  EXECUTE FUNCTION update_shopping_list_timestamp();

CREATE TRIGGER update_inventory_items_timestamp
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_shopping_list_timestamp();

-- Function to get active shopping list or create one
CREATE OR REPLACE FUNCTION get_or_create_shopping_list(
  p_user_id UUID,
  p_list_type TEXT,
  p_source_type TEXT DEFAULT 'manual',
  p_source_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_list_id UUID;
BEGIN
  -- Try to find an active list of this type
  SELECT id INTO v_list_id
  FROM shopping_lists
  WHERE user_id = p_user_id
    AND list_type = p_list_type
    AND is_active = true
    AND is_archived = false
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no active list, create one
  IF v_list_id IS NULL THEN
    INSERT INTO shopping_lists (user_id, list_type, source_type, source_name, name)
    VALUES (
      p_user_id,
      p_list_type,
      p_source_type,
      p_source_name,
      CASE p_list_type
        WHEN 'grocery' THEN 'Grocery List'
        WHEN 'hardware' THEN 'Hardware Store List'
        ELSE 'Shopping List'
      END
    )
    RETURNING id INTO v_list_id;
  END IF;

  RETURN v_list_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add item to shopping list (upsert - increment if exists)
CREATE OR REPLACE FUNCTION add_to_shopping_list(
  p_list_id UUID,
  p_item_name TEXT,
  p_quantity TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_is_tool BOOLEAN DEFAULT false,
  p_priority TEXT DEFAULT 'normal',
  p_source_step INT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_item_id UUID;
BEGIN
  -- Check if item already exists in list (case-insensitive)
  SELECT id INTO v_item_id
  FROM shopping_list_items
  WHERE list_id = p_list_id
    AND LOWER(item_name) = LOWER(p_item_name)
    AND is_checked = false;

  IF v_item_id IS NOT NULL THEN
    -- Item exists, update notes if provided
    IF p_notes IS NOT NULL THEN
      UPDATE shopping_list_items
      SET notes = COALESCE(notes || '; ', '') || p_notes
      WHERE id = v_item_id;
    END IF;
    RETURN v_item_id;
  ELSE
    -- Insert new item
    INSERT INTO shopping_list_items (
      list_id, item_name, quantity, category, is_tool,
      priority, source_step_number, notes
    )
    VALUES (
      p_list_id, p_item_name, p_quantity, p_category, p_is_tool,
      p_priority, p_source_step, p_notes
    )
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
