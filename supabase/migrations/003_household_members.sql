-- Household Members and Dietary Preferences
-- Allows users to save family members/household members with their dietary preferences
-- Used by Do It (Cooking) to personalize recipe recommendations

-- ============================================
-- HOUSEHOLD MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS household_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT, -- e.g., 'self', 'spouse', 'child', 'parent', 'roommate', 'other'
  age_group TEXT, -- e.g., 'infant', 'toddler', 'child', 'teen', 'adult', 'senior'
  is_primary BOOLEAN DEFAULT FALSE, -- marks the main user themselves
  avatar_emoji TEXT, -- optional emoji avatar
  notes TEXT, -- any additional notes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for household_members
DROP POLICY IF EXISTS "Users can view their own household members" ON household_members;
CREATE POLICY "Users can view their own household members"
  ON household_members FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own household members" ON household_members;
CREATE POLICY "Users can insert their own household members"
  ON household_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own household members" ON household_members;
CREATE POLICY "Users can update their own household members"
  ON household_members FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own household members" ON household_members;
CREATE POLICY "Users can delete their own household members"
  ON household_members FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS household_members_user_id_idx ON household_members(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_household_members_updated_at ON household_members;
CREATE TRIGGER update_household_members_updated_at
  BEFORE UPDATE ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DIETARY PREFERENCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS dietary_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES household_members(id) ON DELETE CASCADE NOT NULL,
  preference_type TEXT NOT NULL, -- 'allergy', 'intolerance', 'diet', 'dislike', 'medical'
  name TEXT NOT NULL, -- e.g., 'peanuts', 'gluten', 'vegetarian', 'low-sodium'
  severity TEXT, -- for allergies: 'mild', 'moderate', 'severe', 'life-threatening'
  notes TEXT, -- additional context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE dietary_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can only access preferences for their own household members
DROP POLICY IF EXISTS "Users can view dietary preferences for their household" ON dietary_preferences;
CREATE POLICY "Users can view dietary preferences for their household"
  ON dietary_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.id = dietary_preferences.member_id
      AND hm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert dietary preferences for their household" ON dietary_preferences;
CREATE POLICY "Users can insert dietary preferences for their household"
  ON dietary_preferences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.id = dietary_preferences.member_id
      AND hm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update dietary preferences for their household" ON dietary_preferences;
CREATE POLICY "Users can update dietary preferences for their household"
  ON dietary_preferences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.id = dietary_preferences.member_id
      AND hm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete dietary preferences for their household" ON dietary_preferences;
CREATE POLICY "Users can delete dietary preferences for their household"
  ON dietary_preferences FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.id = dietary_preferences.member_id
      AND hm.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS dietary_preferences_member_id_idx ON dietary_preferences(member_id);
CREATE INDEX IF NOT EXISTS dietary_preferences_type_idx ON dietary_preferences(preference_type);

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dietary_preferences TO authenticated;
