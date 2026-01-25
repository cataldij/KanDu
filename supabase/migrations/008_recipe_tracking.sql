-- Recipe Tracking: Remember recipes cooked and auto-replenish depleted ingredients
-- This integrates with shopping lists to automatically add used ingredients

-- ============================================
-- RECIPES (User's recipe library)
-- ============================================
CREATE TABLE IF NOT EXISTS recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Recipe details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'beverage', 'other')),
  cuisine TEXT, -- Italian, Mexican, Asian, etc.
  servings INT DEFAULT 4,
  prep_time_minutes INT,
  cook_time_minutes INT,

  -- Source tracking
  source_type TEXT CHECK (source_type IN ('manual', 'receipt_scan', 'imported', 'ai_suggested')),
  source_url TEXT, -- If imported from a website
  image_url TEXT,

  -- Usage tracking
  times_cooked INT DEFAULT 0,
  last_cooked_at TIMESTAMPTZ,
  is_favorite BOOLEAN DEFAULT false,

  -- Auto-replenish settings
  auto_replenish_enabled BOOLEAN DEFAULT true, -- When cooked, auto-add ingredients to shopping list

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RECIPE INGREDIENTS
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,

  -- Ingredient details
  ingredient_name TEXT NOT NULL, -- "Chicken breast", "Olive oil"
  generic_name TEXT, -- "chicken", "oil" - for matching with inventory
  brand_preference TEXT, -- User's preferred brand

  -- Quantity
  quantity DECIMAL(10, 2), -- Amount needed
  unit TEXT, -- "cups", "tbsp", "lbs", "pieces"
  quantity_text TEXT, -- Human readable: "2 cups", "1 lb", "3 medium"

  -- Categorization
  category TEXT, -- "protein", "produce", "dairy", "pantry", "spices"
  is_optional BOOLEAN DEFAULT false, -- Optional ingredients

  -- Shopping info
  typical_package_size TEXT, -- "1 lb package", "16 oz jar"
  estimated_cost DECIMAL(10, 2),

  -- Display
  display_order INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COOKING HISTORY (Track when recipes were cooked)
-- ============================================
CREATE TABLE IF NOT EXISTS cooking_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,

  -- What was cooked
  recipe_name TEXT NOT NULL, -- Stored separately in case recipe is deleted
  servings_made INT DEFAULT 4,

  -- When
  cooked_at TIMESTAMPTZ DEFAULT NOW(),

  -- Shopping list integration
  generated_shopping_list_id UUID REFERENCES shopping_lists(id) ON DELETE SET NULL,
  auto_replenished BOOLEAN DEFAULT false, -- Did we auto-add ingredients to shopping list?

  -- Notes
  notes TEXT, -- "Added extra garlic", "Halved the recipe"
  rating INT CHECK (rating >= 1 AND rating <= 5), -- How did it turn out?

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INGREDIENT USAGE (Track which ingredients were used in each cooking)
-- ============================================
CREATE TABLE IF NOT EXISTS ingredient_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cooking_history_id UUID REFERENCES cooking_history(id) ON DELETE CASCADE NOT NULL,

  -- What was used
  ingredient_name TEXT NOT NULL,
  quantity_used TEXT, -- "2 cups", "1 lb"

  -- Was it added to shopping list?
  added_to_shopping_list BOOLEAN DEFAULT false,
  shopping_list_item_id UUID REFERENCES shopping_list_items(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_recipes_last_cooked ON recipes(last_cooked_at);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cooking_history_user_id ON cooking_history(user_id);
CREATE INDEX IF NOT EXISTS idx_cooking_history_recipe_id ON cooking_history(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cooking_history_cooked_at ON cooking_history(cooked_at);
CREATE INDEX IF NOT EXISTS idx_ingredient_usage_cooking_id ON ingredient_usage(cooking_history_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooking_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_usage ENABLE ROW LEVEL SECURITY;

-- Recipes: Users can manage their own recipes
CREATE POLICY "Users can manage their own recipes"
  ON recipes FOR ALL
  USING (auth.uid() = user_id);

-- Recipe Ingredients: Users can manage ingredients for their recipes
CREATE POLICY "Users can manage ingredients for their recipes"
  ON recipe_ingredients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM recipes
    WHERE recipes.id = recipe_ingredients.recipe_id
    AND recipes.user_id = auth.uid()
  ));

-- Cooking History: Users can manage their own history
CREATE POLICY "Users can manage their own cooking history"
  ON cooking_history FOR ALL
  USING (auth.uid() = user_id);

-- Ingredient Usage: Users can manage usage for their cooking history
CREATE POLICY "Users can manage ingredient usage for their cooking"
  ON ingredient_usage FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cooking_history
    WHERE cooking_history.id = ingredient_usage.cooking_history_id
    AND cooking_history.user_id = auth.uid()
  ));

-- ============================================
-- TRIGGERS
-- ============================================

-- Update recipe timestamp
CREATE TRIGGER update_recipes_timestamp
  BEFORE UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION update_shopping_list_timestamp();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to mark a recipe as cooked and optionally auto-replenish ingredients
CREATE OR REPLACE FUNCTION cook_recipe(
  p_recipe_id UUID,
  p_servings INT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_rating INT DEFAULT NULL,
  p_auto_replenish BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_recipe RECORD;
  v_history_id UUID;
  v_list_id UUID;
  v_ingredient RECORD;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the recipe
  SELECT * INTO v_recipe
  FROM recipes
  WHERE id = p_recipe_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;

  -- Create cooking history entry
  INSERT INTO cooking_history (
    user_id, recipe_id, recipe_name, servings_made, notes, rating, auto_replenished
  )
  VALUES (
    v_user_id,
    p_recipe_id,
    v_recipe.name,
    COALESCE(p_servings, v_recipe.servings),
    p_notes,
    p_rating,
    p_auto_replenish AND v_recipe.auto_replenish_enabled
  )
  RETURNING id INTO v_history_id;

  -- Update recipe stats
  UPDATE recipes
  SET
    times_cooked = times_cooked + 1,
    last_cooked_at = NOW()
  WHERE id = p_recipe_id;

  -- Auto-replenish ingredients if enabled
  IF p_auto_replenish AND v_recipe.auto_replenish_enabled THEN
    -- Get or create a grocery shopping list for replenishment
    v_list_id := get_or_create_shopping_list(
      v_user_id,
      'grocery',
      'recipe',
      'Recipe: ' || v_recipe.name
    );

    -- Update the cooking history with the list
    UPDATE cooking_history
    SET generated_shopping_list_id = v_list_id
    WHERE id = v_history_id;

    -- Add each non-optional ingredient to the shopping list
    FOR v_ingredient IN
      SELECT * FROM recipe_ingredients
      WHERE recipe_id = p_recipe_id
      AND is_optional = false
    LOOP
      -- Record ingredient usage
      INSERT INTO ingredient_usage (
        cooking_history_id, ingredient_name, quantity_used, added_to_shopping_list
      )
      VALUES (
        v_history_id,
        v_ingredient.ingredient_name,
        v_ingredient.quantity_text,
        true
      );

      -- Add to shopping list
      PERFORM add_to_shopping_list(
        v_list_id,
        v_ingredient.ingredient_name,
        v_ingredient.quantity_text,
        v_ingredient.category,
        false, -- not a tool
        'normal',
        NULL,
        'Used in: ' || v_recipe.name
      );
    END LOOP;
  END IF;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a recipe from scanned receipt items
-- (Placeholder for future receipt scanning integration)
CREATE OR REPLACE FUNCTION create_recipe_from_ingredients(
  p_name TEXT,
  p_ingredients JSONB, -- Array of { name, quantity, unit, category }
  p_category TEXT DEFAULT 'dinner',
  p_servings INT DEFAULT 4
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_recipe_id UUID;
  v_ingredient JSONB;
  v_order INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create the recipe
  INSERT INTO recipes (user_id, name, category, servings, source_type)
  VALUES (v_user_id, p_name, p_category, p_servings, 'manual')
  RETURNING id INTO v_recipe_id;

  -- Add ingredients
  FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    v_order := v_order + 1;
    INSERT INTO recipe_ingredients (
      recipe_id,
      ingredient_name,
      quantity,
      unit,
      quantity_text,
      category,
      display_order
    )
    VALUES (
      v_recipe_id,
      v_ingredient->>'name',
      (v_ingredient->>'quantity')::DECIMAL,
      v_ingredient->>'unit',
      COALESCE(v_ingredient->>'quantity', '') || ' ' || COALESCE(v_ingredient->>'unit', '') || ' ' || (v_ingredient->>'name'),
      v_ingredient->>'category',
      v_order
    );
  END LOOP;

  RETURN v_recipe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
