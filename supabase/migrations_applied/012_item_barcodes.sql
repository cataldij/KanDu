-- Migration: Add barcode support to shopping list items
-- Phase 3A: Barcode Scanner feature

-- Add barcode column to shopping_list_items
ALTER TABLE shopping_list_items
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add index for fast barcode lookups
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_barcode
ON shopping_list_items(barcode)
WHERE barcode IS NOT NULL;

-- Add index for list + barcode (for fast lookups when scanning)
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_barcode
ON shopping_list_items(list_id, barcode)
WHERE barcode IS NOT NULL;
