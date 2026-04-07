-- Add staffing needs per shift template (skill-based headcount requirements)
-- e.g. [{"skill":"kitchen","count":2},{"skill":"cashier","count":1}]
ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS staffing_needs JSONB DEFAULT '[]'::jsonb;

-- Add open/close availability flags to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_open BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_close BOOLEAN DEFAULT false;
