-- Mark old migrations as already applied in the database
-- This prevents them from being re-run

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('004', '004_guest_mode.sql', ARRAY['-- Already applied manually']),
  ('005', '005_shopping_lists.sql', ARRAY['-- Already applied manually']),
  ('006', '006_guest_mode_multi_image.sql', ARRAY['-- Already applied manually']),
  ('007', '007_guest_kit_zones.sql', ARRAY['-- Already applied manually']),
  ('20260122085739', '20260122085739_create_recipe_images.sql', ARRAY['-- Already applied manually']),
  ('20260122150925', '20260122150925_create_favorites.sql', ARRAY['-- Already applied manually'])
ON CONFLICT (version) DO NOTHING;
