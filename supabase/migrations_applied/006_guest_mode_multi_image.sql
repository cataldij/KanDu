-- Guest Mode Enhancement: Multi-angle kitchen scanning
-- Allows capturing 360° view of home base for better AI navigation

-- Add JSONB array for multiple home base images
-- Structure: [{ url: string, angle: string, description?: string }]
-- Angles: 'front', 'right', 'back', 'left', 'exit'
ALTER TABLE guest_kits
ADD COLUMN IF NOT EXISTS home_base_images JSONB DEFAULT '[]';

-- Add a column to track if the guided scan was completed
ALTER TABLE guest_kits
ADD COLUMN IF NOT EXISTS home_base_scan_complete BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN guest_kits.home_base_images IS 'Array of images capturing 360° view of home base (kitchen). Each object: {url, angle, description}';
COMMENT ON COLUMN guest_kits.home_base_scan_complete IS 'True if user completed the full guided kitchen scan';
