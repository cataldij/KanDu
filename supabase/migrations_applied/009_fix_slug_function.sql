-- Fix ambiguous column reference in slug generation function
-- The variable 'slug' was conflicting with the column 'guest_kits.slug'

CREATE OR REPLACE FUNCTION generate_guest_kit_slug(base_name TEXT)
RETURNS TEXT AS $$
DECLARE
  result_slug TEXT;
  counter INT := 0;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  result_slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  result_slug := regexp_replace(result_slug, '\s+', '-', 'g');
  result_slug := regexp_replace(result_slug, '-+', '-', 'g');
  result_slug := trim(both '-' from result_slug);

  -- If slug exists, append number
  WHILE EXISTS (
    SELECT 1 FROM guest_kits
    WHERE guest_kits.slug = result_slug || CASE WHEN counter > 0 THEN '-' || counter ELSE '' END
  ) LOOP
    counter := counter + 1;
  END LOOP;

  IF counter > 0 THEN
    result_slug := result_slug || '-' || counter;
  END IF;

  RETURN result_slug;
END;
$$ LANGUAGE plpgsql;
