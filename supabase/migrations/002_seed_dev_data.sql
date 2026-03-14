-- ============================================================
-- Dev Seed Data — for local development only
-- Creates one restaurant and sample menu data.
-- DO NOT run in production.
-- ============================================================

-- Seed restaurant
INSERT INTO restaurants (
  id,
  slug,
  name,
  description,
  primary_color,
  phone,
  address,
  city,
  state,
  logistics_default,
  min_order_amount,
  estimated_delivery_minutes
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'the-copper-pot',
  'The Copper Pot',
  'Fine Nigerian cuisine in the heart of Maitama',
  '#B5451B',
  '+2348012345678',
  '14 Adeola Hopewell Street, Maitama',
  'Abuja',
  'FCT',
  'platform_rider',
  3000,
  35
) ON CONFLICT (slug) DO NOTHING;

-- Seed menu categories
INSERT INTO menu_categories (id, restaurant_id, name, display_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Specials', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Rice Dishes', 2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Soups & Swallow', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Proteins', 4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Drinks', 5)
ON CONFLICT DO NOTHING;

-- Seed menu items
INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, is_featured, display_order) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chef''s Party Jollof Rice',
    'Smoky, slow-cooked party jollof with a hint of tomatoes and seasoning. Served with coleslaw and fried plantain.',
    4500,
    true,
    1
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Native Jollof Rice',
    'Traditional jollof rice cooked over firewood for that authentic smoky flavor.',
    3800,
    true,
    2
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'Egusi Soup',
    'Rich egusi soup with assorted meat, stockfish, and fresh vegetables.',
    5500,
    false,
    1
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'Suya (Chicken)',
    'Grilled chicken skewers marinated in spiced peanut powder. Served with sliced onions.',
    3000,
    true,
    1
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Zobo Drink (500ml)',
    'Chilled hibiscus drink sweetened with natural honey.',
    800,
    false,
    1
  )
ON CONFLICT DO NOTHING;

-- Seed option group: Protein choice for rice dishes
INSERT INTO menu_item_options (id, menu_item_id, restaurant_id, name, is_required, min_selections, max_selections) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Choose Protein',
    true,
    1,
    1
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Choose Protein',
    true,
    1,
    1
  )
ON CONFLICT DO NOTHING;

-- Seed option choices
INSERT INTO menu_item_option_choices (id, option_id, restaurant_id, name, price_modifier) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chicken', 0),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Beef', 500),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Fish', 700),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Chicken', 0),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Beef', 500),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Goat Meat', 800)
ON CONFLICT DO NOTHING;

-- Seed platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('delivery_fee_default_ngn', '1500'),
  ('platform_name', '"Foodo"'),
  ('support_email', '"support@foodo.ng"')
ON CONFLICT (key) DO NOTHING;
