-- Table to cache recipe image URLs
CREATE TABLE recipe_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_name text NOT NULL UNIQUE,
  image_url text NOT NULL,
  image_source text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_recipe_images_name ON recipe_images(recipe_name);

ALTER TABLE recipe_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read recipe images"
ON recipe_images FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert recipe images"
ON recipe_images FOR INSERT
TO public
WITH CHECK (true);
