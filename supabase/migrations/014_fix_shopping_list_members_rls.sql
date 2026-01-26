-- Migration: Fix infinite recursion in shopping_list_members RLS policies
-- The previous policies queried shopping_list_members from within policies on shopping_list_members

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view members of their shared lists" ON shopping_list_members;
DROP POLICY IF EXISTS "List owners can manage members" ON shopping_list_members;

-- Fixed policy: Users can see members of lists they own OR are a member of
-- Check ownership via shopping_lists table (no recursion)
CREATE POLICY "Users can view members of accessible lists"
ON shopping_list_members FOR SELECT
USING (
  -- User owns the list
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
  -- OR user is the member being queried (can see own membership)
  OR user_id = auth.uid()
);

-- Fixed policy: Only list owners can add/remove members
-- Check ownership via shopping_lists table (no recursion)
CREATE POLICY "List owners can manage members"
ON shopping_list_members FOR INSERT
WITH CHECK (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "List owners can update members"
ON shopping_list_members FOR UPDATE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "List owners can delete members"
ON shopping_list_members FOR DELETE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);
