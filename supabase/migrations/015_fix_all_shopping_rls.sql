-- Migration: Fix ALL circular RLS policies in shopping tables
-- The sharing feature created circular dependencies between tables

-- ============================================
-- STEP 1: Fix shopping_lists policies
-- ============================================
DROP POLICY IF EXISTS "Users can view their own and shared lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can view their own lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can insert their own lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can update their own lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can delete their own lists" ON shopping_lists;

-- Simple ownership-based policies (no cross-table queries)
CREATE POLICY "Users can view own lists"
ON shopping_lists FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own lists"
ON shopping_lists FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own lists"
ON shopping_lists FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own lists"
ON shopping_lists FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- STEP 2: Fix shopping_list_items policies
-- ============================================
DROP POLICY IF EXISTS "Users can view items in their own and shared lists" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can view items in their lists" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can insert items" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can update items" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can delete items" ON shopping_list_items;

-- Items policies based on list ownership (one-hop join, no recursion)
CREATE POLICY "Users can view items in own lists"
ON shopping_list_items FOR SELECT
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert items in own lists"
ON shopping_list_items FOR INSERT
WITH CHECK (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update items in own lists"
ON shopping_list_items FOR UPDATE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete items in own lists"
ON shopping_list_items FOR DELETE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

-- ============================================
-- STEP 3: Fix shopping_list_members policies
-- ============================================
DROP POLICY IF EXISTS "Users can view members of accessible lists" ON shopping_list_members;
DROP POLICY IF EXISTS "List owners can manage members" ON shopping_list_members;
DROP POLICY IF EXISTS "List owners can update members" ON shopping_list_members;
DROP POLICY IF EXISTS "List owners can delete members" ON shopping_list_members;

-- Members policies based on list ownership (one-hop join, no recursion)
CREATE POLICY "Users can view members of own lists"
ON shopping_list_members FOR SELECT
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "Owners can insert members"
ON shopping_list_members FOR INSERT
WITH CHECK (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "Owners can update members"
ON shopping_list_members FOR UPDATE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);

CREATE POLICY "Owners can delete members"
ON shopping_list_members FOR DELETE
USING (
  list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
);
