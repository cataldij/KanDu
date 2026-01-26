-- Migration: Add real-time collaboration support
-- Phase 3B: Feature #10 - Share shopping lists with family

-- Table for tracking who has access to which lists
CREATE TABLE IF NOT EXISTS shopping_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  UNIQUE(list_id, user_id)
);

-- Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_shopping_list_members_list
ON shopping_list_members(list_id);

CREATE INDEX IF NOT EXISTS idx_shopping_list_members_user
ON shopping_list_members(user_id);

-- Enable Row Level Security
ALTER TABLE shopping_list_members ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see members of lists they have access to
CREATE POLICY "Users can view members of their shared lists"
ON shopping_list_members FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM shopping_list_members WHERE list_id = shopping_list_members.list_id
  )
);

-- RLS Policy: List owners can add/remove members
CREATE POLICY "List owners can manage members"
ON shopping_list_members FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM shopping_list_members
    WHERE list_id = shopping_list_members.list_id AND role = 'owner'
  )
);

-- Update shopping_lists RLS to include shared lists
DROP POLICY IF EXISTS "Users can view their own lists" ON shopping_lists;
CREATE POLICY "Users can view their own and shared lists"
ON shopping_lists FOR SELECT
USING (
  user_id = auth.uid()
  OR id IN (
    SELECT list_id FROM shopping_list_members WHERE user_id = auth.uid()
  )
);

-- Update shopping_list_items RLS to include shared lists
DROP POLICY IF EXISTS "Users can view items in their lists" ON shopping_list_items;
CREATE POLICY "Users can view items in their own and shared lists"
ON shopping_list_items FOR SELECT
USING (
  list_id IN (
    SELECT id FROM shopping_lists
    WHERE user_id = auth.uid()
    OR id IN (SELECT list_id FROM shopping_list_members WHERE user_id = auth.uid())
  )
);

-- Enable Realtime for tables (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_members;
