-- Add budget tracking to shopping lists
-- Migration: 011_shopping_list_budget

-- Add budget columns to shopping_lists table
ALTER TABLE shopping_lists
ADD COLUMN IF NOT EXISTS budget DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add index for price aggregation queries
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_price
ON shopping_list_items(list_id, estimated_price)
WHERE estimated_price IS NOT NULL;

-- Add index for list budget queries
CREATE INDEX IF NOT EXISTS idx_shopping_lists_budget
ON shopping_lists(id, budget)
WHERE budget IS NOT NULL;

-- Comment the columns
COMMENT ON COLUMN shopping_lists.budget IS 'User-set budget limit for this shopping list';
COMMENT ON COLUMN shopping_lists.currency IS 'Currency code (USD, EUR, GBP, etc.)';
