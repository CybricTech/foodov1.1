-- ============================================================
-- Foodo Dev Seed Data
-- Run this in the Supabase SQL editor or via:
--   supabase db reset  (local)
--   paste into SQL editor (remote)
-- ============================================================

-- Restaurant: The Copper Pot
INSERT INTO restaurants (
  id, slug, name, description, primary_color,
  phone, address, city, state,
  logistics_default, min_order_amount, delivery_fee,
  estimated_delivery_minutes, accepts_orders, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'the-copper-pot',
  'The Copper Pot',
  'Fine Nigerian cuisine in the heart of Maitama',
  '#FF6B35',
  '+2348012345678',
  '14 Adeola Hopewell Street, Maitama',
  'Abuja',
  'FCT',
  'platform_rider',
  300000,   -- ₦3,000 min order (kobo)
  150000,   -- ₦1,500 delivery fee (kobo)
  35,
  true,
  true
) ON CONFLICT (slug) DO UPDATE SET
  name                        = EXCLUDED.name,
  description                 = EXCLUDED.description,
  primary_color               = EXCLUDED.primary_color,
  phone                       = EXCLUDED.phone,
  address                     = EXCLUDED.address,
  min_order_amount            = EXCLUDED.min_order_amount,
  delivery_fee                = EXCLUDED.delivery_fee,
  accepts_orders              = EXCLUDED.accepts_orders,
  is_active                   = EXCLUDED.is_active;

-- Menu categories
INSERT INTO menu_categories (id, restaurant_id, name, display_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Specials',        1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Rice Dishes',     2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Soups & Swallow', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Proteins',        4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Drinks',          5)
ON CONFLICT DO NOTHING;

-- Menu items (price_kobo = price in kobo, price = NGN for legacy column)
INSERT INTO menu_items (
  id, restaurant_id, category_id, name, description,
  price, price_kobo, is_featured, is_available, display_order
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chef''s Party Jollof Rice',
    'Smoky, slow-cooked party jollof with a hint of tomatoes and seasoning. Served with coleslaw and fried plantain.',
    4500, 450000, true, true, 1
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Native Jollof Rice',
    'Traditional jollof rice cooked over firewood for that authentic smoky flavour.',
    3800, 380000, true, true, 1
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Fried Rice & Chicken',
    'Nigerian-style fried rice with mixed vegetables and one full fried chicken.',
    4200, 420000, false, true, 2
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'Egusi Soup',
    'Rich egusi soup with assorted meat, stockfish, and fresh vegetables. Served with swallow of your choice.',
    5500, 550000, false, true, 1
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'Oha Soup',
    'Delicious oha leaves slow-cooked with cocoyam and assorted meats.',
    5000, 500000, false, true, 2
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'Suya (Chicken)',
    'Grilled chicken skewers marinated in spiced peanut powder. Served with sliced onions and tomatoes.',
    3000, 300000, true, true, 1
  ),
  (
    '20000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'Peppered Gizzard',
    'Tender gizzard slow-cooked in a rich peppered sauce with onions and green peppers.',
    2800, 280000, false, true, 2
  ),
  (
    '20000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Zobo Drink (500ml)',
    'Chilled hibiscus drink sweetened with natural honey and ginger.',
    800, 80000, false, true, 1
  ),
  (
    '20000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Kunu (500ml)',
    'Refreshing millet drink, lightly spiced with ginger and cloves.',
    700, 70000, false, true, 2
  ),
  (
    '20000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Water (75cl)',
    'Chilled table water.',
    300, 30000, false, true, 3
  )
ON CONFLICT DO NOTHING;

-- Option group: Protein choice for party jollof
INSERT INTO menu_item_options (
  id, menu_item_id, restaurant_id, name, is_required, min_selections, max_selections
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Choose Protein',
    true, 1, 1
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Choose Protein',
    true, 1, 1
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'Choose Swallow',
    true, 1, 1
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'Choose Swallow',
    true, 1, 1
  )
ON CONFLICT DO NOTHING;

-- Option choices (price_modifier in NGN, price_modifier_kobo in kobo)
INSERT INTO menu_item_option_choices (
  id, option_id, restaurant_id, name, price_modifier, price_modifier_kobo
) VALUES
  -- Protein for party jollof
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chicken',   0,   0),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Beef',      500, 50000),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Fish',      700, 70000),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Goat Meat', 800, 80000),
  -- Protein for native jollof
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Chicken',   0,   0),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Beef',      500, 50000),
  ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Goat Meat', 800, 80000),
  -- Swallow for egusi
  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Eba',       0, 0),
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Fufu',      0, 0),
  ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Pounded Yam', 200, 20000),
  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Semolina',  0, 0),
  -- Swallow for oha
  ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Eba',       0, 0),
  ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Fufu',      0, 0),
  ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Pounded Yam', 200, 20000)
ON CONFLICT DO NOTHING;

-- Platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('delivery_fee_default_kobo', '150000'),
  ('platform_name',             '"Foodo"'),
  ('support_email',             '"support@foodo.ng"'),
  ('support_phone',             '"+2349012345678"')
ON CONFLICT (key) DO NOTHING;
