-- Drop and recreate cleanly (handles partial runs from earlier attempts)
DROP TABLE IF EXISTS platform_settings CASCADE;

CREATE TABLE platform_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Service charge: apply both fields — set either to 0 to disable that component
  service_charge_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.03,  -- e.g. 0.03 = 3%
  service_charge_fixed_kobo BIGINT NOT NULL DEFAULT 0,           -- flat fee in kobo
  settlement_hold_hours     INTEGER NOT NULL DEFAULT 24,          -- hours before funds become available
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID REFERENCES auth.users(id)
);

-- Singleton enforcement
CREATE UNIQUE INDEX platform_settings_singleton ON platform_settings ((true));

-- Seed default row
INSERT INTO platform_settings (service_charge_pct, service_charge_fixed_kobo, settlement_hold_hours)
VALUES (0.03, 0, 24);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_admin_only"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
