-- ============================================================
-- Org Structure: Department Hierarchy, Store Managers,
--   Manager History, Job Positions, Company FK, Store Cleanup
-- Consolidates: seed_employee_dept_store (PART 1 schema only),
--   job_positions (DDL only), department_company_fk,
--   remove_duplicate_stores
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Department Hierarchy + Store Manager Tracking
-- ════════════════════════════════════════════════════════════

-- Departments: add hierarchy level and parent reference
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT '部',
  ADD COLUMN IF NOT EXISTS parent_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_effective_date DATE;

-- Stores: add parent department reference and manager tracking
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_effective_date DATE;

-- Department/store manager history table
CREATE TABLE IF NOT EXISTS public.department_manager_history (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
    department_id           UUID        REFERENCES public.departments(id) ON DELETE CASCADE,
    store_id                UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
    manager_user_id         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    manager_employee_number TEXT        NOT NULL,
    manager_name            TEXT        NOT NULL,
    effective_date          DATE        NOT NULL,
    end_date                DATE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_mgr_hist_dept  ON public.department_manager_history(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_mgr_hist_store ON public.department_manager_history(store_id);
CREATE INDEX IF NOT EXISTS idx_dept_mgr_hist_dates ON public.department_manager_history(effective_date DESC);

ALTER TABLE public.department_manager_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_dept_mgr_history" ON public.department_manager_history
  USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Job Positions Table
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.job_positions (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID          REFERENCES public.organizations(id) ON DELETE CASCADE,
    title                TEXT          NOT NULL,
    job_grade            TEXT,
    is_supervisory       BOOLEAN       DEFAULT false,
    is_active            BOOLEAN       DEFAULT true,
    required_count       INTEGER       DEFAULT 0,
    current_count        INTEGER       DEFAULT 0,
    shortage             INTEGER       DEFAULT 0,
    position_allowance   NUMERIC(10,2) DEFAULT 0,
    department_id        UUID          REFERENCES public.departments(id) ON DELETE SET NULL,
    description          TEXT,
    created_at           TIMESTAMPTZ   DEFAULT now(),
    updated_at           TIMESTAMPTZ   DEFAULT now(),
    UNIQUE(organization_id, title)
);

CREATE INDEX IF NOT EXISTS idx_job_positions_org    ON public.job_positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_positions_active ON public.job_positions(is_active);

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_job_positions" ON public.job_positions
  USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Company FK on Departments + Job Positions
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_departments_company ON public.departments(company_id);

ALTER TABLE public.job_positions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_positions_company ON public.job_positions(company_id);

-- Backfill: assign all existing rows to the first company in the org
DO $$
DECLARE
  comp_id UUID;
BEGIN
  SELECT c.id INTO comp_id
  FROM public.companies c
  JOIN public.organizations o ON c.organization_id = o.id
  LIMIT 1;

  IF comp_id IS NOT NULL THEN
    UPDATE public.departments  SET company_id = comp_id WHERE company_id IS NULL;
    UPDATE public.job_positions SET company_id = comp_id WHERE company_id IS NULL;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Remove Duplicate Stores (old naming convention)
-- ════════════════════════════════════════════════════════════

-- Delete shift_templates referencing old stores first (FK constraint)
DELETE FROM public.shift_templates
WHERE store_id IN (
    SELECT id FROM public.stores
    WHERE store_code IN ('TP-ZS','TC-YC','TP-YC','TP-BZ','TP-TM','TP-NG','TP-NJ','KH-ZZ','TP-LZ','TP-SJ','TC-WX')
);

-- Delete the 11 duplicate old-format stores
DELETE FROM public.stores
WHERE store_code IN ('TP-ZS','TC-YC','TP-YC','TP-BZ','TP-TM','TP-NG','TP-NJ','KH-ZZ','TP-LZ','TP-SJ','TC-WX');
