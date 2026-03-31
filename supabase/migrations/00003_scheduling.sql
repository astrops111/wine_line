-- ============================================================
-- Scheduling: Variable Hours, Shift Marketplace, Templates,
--   Labor Budget, Demand Forecast, KPIs, Required Skills
-- Consolidates: variable_working_hours, open_shift_marketplace,
--   schedule_templates, labor_budget, demand_forecast,
--   scheduling_kpis, employee_skills (ALTER shift_templates only)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Variable Working Hours (變形工時)
-- ════════════════════════════════════════════════════════════

ALTER TABLE stores ADD COLUMN IF NOT EXISTS working_hour_type TEXT DEFAULT 'standard';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS variable_period_start DATE;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Open Shift Marketplace
-- ════════════════════════════════════════════════════════════

ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS bid_user_id UUID REFERENCES users(id);
ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS bid_message TEXT;
ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS bid_at TIMESTAMPTZ;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Schedule Template Library
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  description TEXT,
  assignments JSONB NOT NULL, -- Array of {day_of_week, user_id, start_time, end_time, break_minutes, shift_template_id}
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Labor Cost Budgeting
-- ════════════════════════════════════════════════════════════

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS labor_budget NUMERIC(10,2);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS budget_alert_threshold NUMERIC(3,2) DEFAULT 0.90;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_labor_budget NUMERIC(10,2);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS hourly_rate_default NUMERIC(6,2) DEFAULT 183;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: Required Skills on Shift Templates
-- ════════════════════════════════════════════════════════════

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS required_skills TEXT[] DEFAULT '{}';


-- ════════════════════════════════════════════════════════════
-- SECTION 6: Demand Forecasting + POS Integration
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pos_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  provider TEXT NOT NULL, -- 'square', 'iCHEF', 'custom'
  api_key_encrypted TEXT,
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL,
  revenue NUMERIC(10,2),
  transactions INTEGER,
  foot_traffic INTEGER,
  weather TEXT,
  is_holiday BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual', -- 'manual', 'pos', 'forecast'
  UNIQUE(store_id, date)
);


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Scheduling KPIs
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduling_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  store_id UUID REFERENCES stores(id),
  week_start DATE NOT NULL,
  ai_generated BOOLEAN DEFAULT false,
  manual_edits INTEGER DEFAULT 0,
  violations_at_publish INTEGER DEFAULT 0,
  acceptance_rate NUMERIC(5,2), -- % of AI schedule kept as-is
  avg_preference_score NUMERIC(5,2),
  avg_consistency_score NUMERIC(5,2),
  total_ot_hours NUMERIC(6,2),
  labor_cost NUMERIC(10,2),
  total_hours NUMERIC(6,2),
  employee_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, week_start)
);
