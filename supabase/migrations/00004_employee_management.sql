-- ============================================================
-- Employee Management: Skills, Employee Number, Work Permits
-- Consolidates: employee_skills (CREATE TABLE), employee_number,
--   hrm_gaps (work_permit columns)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Employee Skills / Certification Tracking
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  proficiency TEXT DEFAULT 'basic', -- basic, intermediate, advanced
  certified_at DATE,
  expires_at DATE,
  UNIQUE(user_id, skill_name)
);


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Employee Number (Auto-Generated)
-- ════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_number ON users(employee_number) WHERE employee_number IS NOT NULL;

-- Backfill existing employees with EMP-001, EMP-002, etc.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY hire_date NULLS LAST, created_at) AS rn
  FROM users
  WHERE employee_number IS NULL AND status != 'archived'
)
UPDATE users SET employee_number = 'EMP-' || LPAD(numbered.rn::TEXT, 3, '0')
FROM numbered WHERE users.id = numbered.id;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Foreign Worker Tracking
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS work_permit_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS work_permit_expiry DATE;
