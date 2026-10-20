-- Launch prices (plan sections 4 and 6), verified 13 October 2026.
-- The owner changes these from the dashboard; this is only the starting point.

INSERT INTO fx_rates (usd_ngn) VALUES (1400.00);

-- Per-second and per-image products. Retail = plan price for a 5 s clip / 1 image.
INSERT INTO products (code, provider, model, workspace, unit, cost_usd_micros, price_kobo) VALUES
  ('video_lite',     'xai', 'grok-imagine-video-1.5-lite', 'studio', 'second', 20000,  9000),  -- N450 / 5 s
  ('video_standard', 'xai', 'grok-imagine-video',          'studio', 'second', 50000, 18000),  -- N900 / 5 s
  ('video_premium',  'xai', 'grok-imagine-video-1.5',      'studio', 'second', 80000, 30000),  -- N1,500 / 5 s
  ('image_standard', 'xai', 'grok-imagine-image',          'studio', 'image',  20000, 10000),  -- N100
  ('image_hd',       'xai', 'grok-imagine-image-2.0',      'studio', 'image',  40000, 20000);  -- N200

-- Text products, per million tokens. Retail prices are set so a typical request
-- (2,000 tokens in, 1,500 out) costs the plan's price.
INSERT INTO products (code, provider, model, workspace, unit,
                      cost_usd_micros, price_kobo, output_cost_usd_micros, output_price_kobo) VALUES
  ('text_student',  'groq', 'openai/gpt-oss-20b',  'academy', '1m_tokens',   75000,  125000,  300000,  500000),  -- N10
  ('text_dev',      'groq', 'openai/gpt-oss-120b', 'console', '1m_tokens',  150000,  250000,  600000, 1000000),  -- N20
  ('text_dev_pro',  'xai',  'grok-build-0.1',      'console', '1m_tokens', 1000000, 1000000, 2000000, 2000000),  -- N50
  ('text_expert',   'xai',  'grok-4.7',            'console', '1m_tokens', 2000000, 1538500, 6000000, 4615000);  -- N100

INSERT INTO bundles (code, name, price_kobo, credit_kobo) VALUES
  ('starter',         'Starter',          50000,   50000),
  ('student_monthly', 'Student Monthly', 200000,  230000),
  ('creator',         'Creator',        1000000, 1100000),
  ('developer_pro',   'Developer Pro',  1500000, 1650000),
  ('studio',          'Studio',         5000000, 5750000);
