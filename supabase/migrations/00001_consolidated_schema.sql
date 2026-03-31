-- ============================================================
-- Consolidated Migration — AI LINE Bot HRM Admin Panel
-- Squashes 29 incremental migrations into a single file.
-- Generated 2026-03-24
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: Extend existing base tables (no new-table FK deps)
-- Base tables already exist: organizations, users, stores,
-- workflows, workflow_instances, workflow_steps, tasks,
-- line_groups, line_users, checklists, checklist_items,
-- time_records, shift_assignments
-- ────────────────────────────────────────────────────────────

-- workflow_instances
ALTER TABLE public.workflow_instances
  ADD COLUMN IF NOT EXISTS store_id         UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.workflow_instances DROP CONSTRAINT IF EXISTS workflow_instances_status_check;
ALTER TABLE public.workflow_instances ADD CONSTRAINT workflow_instances_status_check
  CHECK (status = ANY (ARRAY['running','completed','paused','cancelled','archived']));

-- workflows
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS due_date      DATE,
  ADD COLUMN IF NOT EXISTS planned_start TIMESTAMPTZ;

-- line_users
ALTER TABLE public.line_users
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS pending_action  JSONB;

-- stores: GPS / WiFi clock-in
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS gps_lat          NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS gps_lng          NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS gps_radius_m     INTEGER  DEFAULT 200,
  ADD COLUMN IF NOT EXISTS wifi_allowed_ips TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clock_in_method  TEXT     DEFAULT 'any';

-- time_records: GPS clock-in data
ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS clock_in_lat        NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_lng        NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS clock_in_method     TEXT DEFAULT 'manual';

-- users: extended employee fields (dept FK added later after departments table)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_line_manager           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manager                BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_name                TEXT,
  ADD COLUMN IF NOT EXISTS last_name                 TEXT,
  ADD COLUMN IF NOT EXISTS english_name              TEXT,
  ADD COLUMN IF NOT EXISTS id_number                 TEXT,
  ADD COLUMN IF NOT EXISTS birth_date                DATE,
  ADD COLUMN IF NOT EXISTS gender                    TEXT,
  ADD COLUMN IF NOT EXISTS nationality               TEXT DEFAULT 'TW',
  ADD COLUMN IF NOT EXISTS address                   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone   TEXT,
  ADD COLUMN IF NOT EXISTS resign_date               DATE,
  ADD COLUMN IF NOT EXISTS termination_reason        TEXT,
  ADD COLUMN IF NOT EXISTS job_grade                 TEXT,
  ADD COLUMN IF NOT EXISTS probation_end_date        DATE,
  ADD COLUMN IF NOT EXISTS bank_code                 TEXT,
  ADD COLUMN IF NOT EXISTS bank_account              TEXT,
  ADD COLUMN IF NOT EXISTS labor_ins_enrolled        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS labor_ins_grade           INTEGER,
  ADD COLUMN IF NOT EXISTS labor_ins_enrolled_date   DATE,
  ADD COLUMN IF NOT EXISTS labor_ins_withdraw_date   DATE,
  ADD COLUMN IF NOT EXISTS health_ins_enrolled       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_ins_grade          INTEGER,
  ADD COLUMN IF NOT EXISTS health_ins_enrolled_date  DATE,
  ADD COLUMN IF NOT EXISTS labor_pension_enrolled    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS labor_pension_rate        NUMERIC(4,2) DEFAULT 6.00,
  ADD COLUMN IF NOT EXISTS is_archived               BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_identities        TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reporting_to              UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- checklists: org scoping, description, status (dept FK added later)
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS store_id        UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_instance_id UUID REFERENCES public.workflow_instances(id) ON DELETE SET NULL;
UPDATE public.checklists SET status = 'active' WHERE status IS NULL;

-- ────────────────────────────────────────────────────────────
-- SECTION 2: Departments + back-references
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.departments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    description     TEXT,
    manager_user_id UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.department_line_groups (
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    line_group_id UUID REFERENCES public.line_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (department_id, line_group_id)
);
CREATE INDEX IF NOT EXISTS idx_dept_line_groups_dept  ON public.department_line_groups(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_line_groups_group ON public.department_line_groups(line_group_id);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_departments" ON public.departments USING (true) WITH CHECK (true);
ALTER TABLE public.department_line_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_dept_line_groups" ON public.department_line_groups USING (true) WITH CHECK (true);

-- Now add department FK to users and checklists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'checklists' AND column_name = 'department_id'
    ) THEN
        ALTER TABLE public.checklists
            ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: LINE / Workflow junction tables
-- ────────────────────────────────────────────────────────────

-- user ↔ LINE groups
CREATE TABLE IF NOT EXISTS public.user_line_groups (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    line_group_id UUID NOT NULL REFERENCES public.line_groups(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, line_group_id)
);
CREATE INDEX IF NOT EXISTS idx_user_line_groups_user_id  ON public.user_line_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_line_groups_group_id ON public.user_line_groups(line_group_id);

-- workflow template ↔ LINE groups
CREATE TABLE IF NOT EXISTS public.workflow_line_group_assignments (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id   UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    line_group_id UUID NOT NULL REFERENCES public.line_groups(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workflow_id, line_group_id)
);
CREATE INDEX IF NOT EXISTS idx_wlga_workflow_id  ON public.workflow_line_group_assignments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wlga_line_group_id ON public.workflow_line_group_assignments(line_group_id);
ALTER TABLE public.workflow_line_group_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_workflow_line_group_assignments"
    ON public.workflow_line_group_assignments FOR ALL USING (true) WITH CHECK (true);

-- workflow instance ↔ LINE groups
CREATE TABLE IF NOT EXISTS public.workflow_instance_line_group_assignments (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_instance_id UUID NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
    line_group_id        UUID NOT NULL REFERENCES public.line_groups(id) ON DELETE CASCADE,
    created_at           TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workflow_instance_id, line_group_id)
);
CREATE INDEX IF NOT EXISTS idx_wilga_instance_id ON public.workflow_instance_line_group_assignments(workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_wilga_group_id    ON public.workflow_instance_line_group_assignments(line_group_id);
ALTER TABLE public.workflow_instance_line_group_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_workflow_instance_line_group_assignments"
    ON public.workflow_instance_line_group_assignments FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- SECTION 4: Employee ↔ Stores junction
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_stores (
    user_id    UUID REFERENCES public.users(id)  ON DELETE CASCADE,
    store_id   UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, store_id)
);
CREATE INDEX IF NOT EXISTS idx_user_stores_user_id  ON public.user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store_id ON public.user_stores(store_id);

-- Migrate existing single-store assignments
INSERT INTO public.user_stores (user_id, store_id, is_primary)
SELECT id, store_id, true
FROM   public.users
WHERE  store_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_user_stores" ON public.user_stores USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- SECTION 5: Checklist owners + task linking
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checklist_owners (
    checklist_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES public.users(id)      ON DELETE CASCADE,
    PRIMARY KEY (checklist_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_owners_checklist ON public.checklist_owners(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_owners_user      ON public.checklist_owners(user_id);

CREATE TABLE IF NOT EXISTS public.task_checklists (
    task_id      UUID REFERENCES public.tasks(id)      ON DELETE CASCADE,
    checklist_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, checklist_id)
);
CREATE INDEX IF NOT EXISTS idx_task_checklists_task      ON public.task_checklists(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklists_checklist ON public.task_checklists(checklist_id);

ALTER TABLE public.checklist_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_checklist_owners" ON public.checklist_owners USING (true) WITH CHECK (true);
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_task_checklists" ON public.task_checklists USING (true) WITH CHECK (true);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_checklists" ON public.checklists;
CREATE POLICY "allow_all_checklists" ON public.checklists USING (true) WITH CHECK (true);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_checklist_items" ON public.checklist_items;
CREATE POLICY "allow_all_checklist_items" ON public.checklist_items USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- SECTION 6: HRM Core — overtime, leave, punch corrections
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.overtime_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id),
    store_id            UUID        REFERENCES public.stores(id),
    user_id             UUID        NOT NULL REFERENCES public.users(id),
    shift_assignment_id UUID        REFERENCES public.shift_assignments(id),
    request_date        DATE        NOT NULL,
    planned_end_time    TIME,
    actual_start_time   TIMESTAMPTZ,
    actual_end_time     TIMESTAMPTZ,
    ot_hours            NUMERIC(4,2),
    ot_type             TEXT        NOT NULL DEFAULT 'pay',
    filing_type         TEXT        NOT NULL DEFAULT 'pre',
    reason              TEXT,
    status              TEXT        NOT NULL DEFAULT 'pending',
    approved_by         UUID        REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ot_requests_user   ON public.overtime_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ot_requests_store  ON public.overtime_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_ot_requests_status ON public.overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_ot_requests_date   ON public.overtime_requests(request_date);

CREATE TABLE IF NOT EXISTS public.leave_balances (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES public.organizations(id),
    user_id         UUID         NOT NULL REFERENCES public.users(id),
    year            INTEGER      NOT NULL,
    leave_type      TEXT         NOT NULL,
    total_days      NUMERIC(5,1) NOT NULL DEFAULT 0,
    used_days       NUMERIC(5,1) NOT NULL DEFAULT 0,
    carry_over_days NUMERIC(5,1) NOT NULL DEFAULT 0,
    expires_at      DATE,
    created_at      TIMESTAMPTZ  DEFAULT now(),
    updated_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (user_id, year, leave_type)
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user ON public.leave_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON public.leave_balances(year);

CREATE TABLE IF NOT EXISTS public.punch_corrections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id),
    store_id            UUID        REFERENCES public.stores(id),
    user_id             UUID        NOT NULL REFERENCES public.users(id),
    time_record_id      UUID        REFERENCES public.time_records(id),
    correction_type     TEXT        NOT NULL DEFAULT 'both',
    original_clock_in   TIMESTAMPTZ,
    original_clock_out  TIMESTAMPTZ,
    requested_clock_in  TIMESTAMPTZ,
    requested_clock_out TIMESTAMPTZ,
    reason              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending',
    approved_by         UUID        REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punch_corrections_user   ON public.punch_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_punch_corrections_store  ON public.punch_corrections(store_id);
CREATE INDEX IF NOT EXISTS idx_punch_corrections_status ON public.punch_corrections(status);

-- ────────────────────────────────────────────────────────────
-- SECTION 7: Payroll Engine
-- ────────────────────────────────────────────────────────────

-- Salary structures
CREATE TABLE IF NOT EXISTS public.salary_structures (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id              UUID REFERENCES public.users(id) ON DELETE CASCADE,
    base_salary          NUMERIC(10,2) NOT NULL DEFAULT 0,
    role_allowance       NUMERIC(10,2) NOT NULL DEFAULT 0,
    meal_allowance       NUMERIC(10,2) NOT NULL DEFAULT 0,
    transport_allowance  NUMERIC(10,2) NOT NULL DEFAULT 0,
    attendance_bonus     NUMERIC(10,2) NOT NULL DEFAULT 0,
    salary_type          VARCHAR(10) NOT NULL DEFAULT 'monthly',
    hourly_rate          NUMERIC(10,2) NOT NULL DEFAULT 0,
    health_ins_dependents INT NOT NULL DEFAULT 0,
    effective_from       DATE NOT NULL DEFAULT CURRENT_DATE,
    year_end_bonus_months NUMERIC(4,2) DEFAULT 0,
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_salary_structures_org_user ON public.salary_structures(org_id, user_id);

-- Annual labor insurance brackets (2020–2026)
CREATE TABLE IF NOT EXISTS public.labor_ins_brackets (
    year             INT            NOT NULL,
    grade            INT            NOT NULL,
    min_salary       NUMERIC(10,2)  NOT NULL,
    insured_salary   NUMERIC(10,2)  NOT NULL,
    employee_premium NUMERIC(10,2)  NOT NULL,
    employer_premium NUMERIC(10,2)  NOT NULL,
    PRIMARY KEY (year, grade)
);

-- Annual health insurance brackets (2020–2026)
CREATE TABLE IF NOT EXISTS public.health_ins_brackets (
    year             INT            NOT NULL,
    grade            INT            NOT NULL,
    min_salary       NUMERIC(10,2)  NOT NULL,
    insured_salary   NUMERIC(10,2)  NOT NULL,
    employee_premium NUMERIC(10,2)  NOT NULL,
    employer_premium NUMERIC(10,2)  NOT NULL,
    PRIMARY KEY (year, grade)
);

CREATE INDEX IF NOT EXISTS idx_labor_ins_year_grade  ON public.labor_ins_brackets(year, grade);
CREATE INDEX IF NOT EXISTS idx_health_ins_year_grade ON public.health_ins_brackets(year, grade);

-- Payroll runs
CREATE TABLE IF NOT EXISTS public.payroll_runs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    pay_period     CHAR(7) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft',
    run_date       DATE,
    total_gross    NUMERIC(12,2) DEFAULT 0,
    total_net      NUMERIC(12,2) DEFAULT 0,
    employee_count INT DEFAULT 0,
    notes          TEXT,
    created_by     UUID REFERENCES public.users(id),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, pay_period)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_period ON public.payroll_runs(org_id, pay_period);

-- Individual payroll records
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id          UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    org_id                  UUID REFERENCES public.organizations(id),
    user_id                 UUID REFERENCES public.users(id),
    pay_period              CHAR(7) NOT NULL,
    base_salary             NUMERIC(10,2) DEFAULT 0,
    role_allowance          NUMERIC(10,2) DEFAULT 0,
    meal_allowance          NUMERIC(10,2) DEFAULT 0,
    transport_allowance     NUMERIC(10,2) DEFAULT 0,
    attendance_bonus_earned NUMERIC(10,2) DEFAULT 0,
    overtime_pay            NUMERIC(10,2) DEFAULT 0,
    ot_hours_weekday        NUMERIC(5,2)  DEFAULT 0,
    ot_hours_holiday        NUMERIC(5,2)  DEFAULT 0,
    gross_salary            NUMERIC(10,2) DEFAULT 0,
    leave_deduction         NUMERIC(10,2) DEFAULT 0,
    leave_days_deducted     NUMERIC(4,1)  DEFAULT 0,
    labor_ins_employee      NUMERIC(10,2) DEFAULT 0,
    health_ins_employee     NUMERIC(10,2) DEFAULT 0,
    labor_pension_employee  NUMERIC(10,2) DEFAULT 0,
    total_deductions        NUMERIC(10,2) DEFAULT 0,
    labor_ins_employer      NUMERIC(10,2) DEFAULT 0,
    health_ins_employer     NUMERIC(10,2) DEFAULT 0,
    labor_pension_employer  NUMERIC(10,2) DEFAULT 0,
    other_bonus             NUMERIC(10,2) DEFAULT 0,
    year_end_bonus          NUMERIC(10,2) DEFAULT 0,
    income_tax_withheld     NUMERIC(10,2) DEFAULT 0,
    late_deduction          NUMERIC(10,2) DEFAULT 0,
    late_minutes            INTEGER       DEFAULT 0,
    net_salary              NUMERIC(10,2) DEFAULT 0,
    hours_worked            NUMERIC(6,2)  DEFAULT 0,
    payslip_sent_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_records_run         ON public.payroll_records(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_user_period ON public.payroll_records(user_id, pay_period);

-- Income tax brackets (Taiwan 2024 monthly withholding)
CREATE TABLE IF NOT EXISTS public.income_tax_brackets (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    min_salary   INTEGER NOT NULL,
    max_salary   INTEGER,
    tax_rate     NUMERIC(5,4) NOT NULL,
    fixed_amount INTEGER NOT NULL DEFAULT 0,
    description  TEXT
);

-- ────────────────────────────────────────────────────────────
-- SECTION 8: Multi-Agent Orchestration
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_registry (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name      TEXT        NOT NULL,
    agent_name     TEXT        NOT NULL,
    description    TEXT,
    description_en TEXT,
    endpoint       TEXT        NOT NULL,
    io_contract    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    model          TEXT        NOT NULL DEFAULT 'qwen3.5-plus',
    status         TEXT        NOT NULL DEFAULT 'active',
    sort_order     INTEGER     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_agent_registry" ON public.agent_registry FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.agent_tasks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    orchestration_id UUID        NOT NULL,
    agent_team       TEXT        NOT NULL,
    agent_name       TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'pending',
    input            JSONB,
    output           JSONB,
    error            TEXT,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_agent_tasks" ON public.agent_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_orch   ON public.agent_tasks(orchestration_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON public.agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_team   ON public.agent_tasks(agent_team);

CREATE TABLE IF NOT EXISTS public.help_articles (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT        NOT NULL,
    title_en       TEXT        NOT NULL,
    content        TEXT        NOT NULL,
    content_en     TEXT        NOT NULL,
    category       TEXT        NOT NULL,
    tags           TEXT[]      DEFAULT '{}',
    page_route     TEXT        UNIQUE,
    language       TEXT        NOT NULL DEFAULT 'bilingual',
    fts_zh         TSVECTOR GENERATED ALWAYS AS (
                       to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))
                   ) STORED,
    fts_en         TSVECTOR GENERATED ALWAYS AS (
                       to_tsvector('english', coalesce(title_en,'') || ' ' || coalesce(content_en,''))
                   ) STORED,
    generated_by   TEXT        DEFAULT 'doc-agent',
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_help_articles" ON public.help_articles FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_help_articles_fts_zh   ON public.help_articles USING GIN(fts_zh);
CREATE INDEX IF NOT EXISTS idx_help_articles_fts_en   ON public.help_articles USING GIN(fts_en);
CREATE INDEX IF NOT EXISTS idx_help_articles_category ON public.help_articles(category);
CREATE INDEX IF NOT EXISTS idx_help_articles_route    ON public.help_articles(page_route);

CREATE TABLE IF NOT EXISTS public.agent_runs (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type               TEXT        NOT NULL DEFAULT 'doc-generation',
    status             TEXT        NOT NULL DEFAULT 'running',
    articles_generated INTEGER     DEFAULT 0,
    summary            TEXT,
    started_at         TIMESTAMPTZ DEFAULT now(),
    completed_at       TIMESTAMPTZ
);
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_agent_runs" ON public.agent_runs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status  ON public.agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON public.agent_runs(started_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 9: RBAC — Roles, User Roles, Module Access
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name   TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.module_access (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    module_key       TEXT    NOT NULL,
    module_name_zh   TEXT    NOT NULL DEFAULT '',
    module_name_en   TEXT    NOT NULL DEFAULT '',
    icon             TEXT    NOT NULL DEFAULT '📦',
    is_enabled       BOOLEAN NOT NULL DEFAULT true,
    required_role    TEXT    NOT NULL DEFAULT 'all',
    sort_order       INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.module_access'::regclass
          AND contype = 'u'
          AND conname = 'module_access_org_key_unique'
    ) THEN
        ALTER TABLE public.module_access
            ADD CONSTRAINT module_access_org_key_unique
            UNIQUE(organization_id, module_key);
    END IF;
END$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 10: Helper Functions (needed for org-scoped RLS)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM   public.users
    WHERE  auth_user_id = auth.uid()
    LIMIT  1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   public.user_roles  ur
        JOIN   public.roles       r  ON r.id = ur.role_id
        JOIN   public.users       u  ON u.id = ur.user_id
        WHERE  u.auth_user_id = auth.uid()
          AND  r.role_name    = check_role
    );
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 11: Employee dependents + position history
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_dependents (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id),
    user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    relationship        TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    id_number           TEXT,
    birth_date          DATE,
    health_ins_enrolled BOOLEAN     DEFAULT false,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emp_dependents_user ON public.employee_dependents(user_id);

CREATE TABLE IF NOT EXISTS public.employee_position_history (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id),
    user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    change_type         TEXT        NOT NULL DEFAULT 'promotion',
    effective_date      DATE        NOT NULL,
    reason              TEXT,
    recorded_by         UUID        REFERENCES public.users(id),
    title               TEXT,
    job_grade           TEXT,
    department_id       UUID        REFERENCES public.departments(id),
    department_name     TEXT,
    store_id            UUID        REFERENCES public.stores(id),
    store_name          TEXT,
    employee_type       TEXT,
    salary_type         TEXT        DEFAULT 'monthly',
    base_salary         NUMERIC(10,2),
    hourly_wage         NUMERIC(8,2),
    role_allowance      NUMERIC(10,2),
    meal_allowance      NUMERIC(10,2),
    transport_allowance NUMERIC(10,2),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_history_user ON public.employee_position_history(user_id);
CREATE INDEX IF NOT EXISTS idx_pos_history_date ON public.employee_position_history(effective_date DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 12: Audit Logs, Performance, Shift Swaps
-- ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.performance_kpis CASCADE;
DROP TABLE IF EXISTS public.performance_reviews CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.shift_swap_requests CASCADE;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    user_name       TEXT,
    action          TEXT        NOT NULL,
    module          TEXT        NOT NULL,
    table_name      TEXT,
    record_id       UUID,
    record_label    TEXT,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_org_idx        ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx       ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_module_idx     ON public.audit_logs(module);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.performance_reviews (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reviewer_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    period          TEXT        NOT NULL,
    period_type     TEXT        NOT NULL DEFAULT 'quarterly',
    overall_score   NUMERIC(3,1),
    status          TEXT        NOT NULL DEFAULT 'draft',
    strengths       TEXT,
    improvements    TEXT,
    goals_next      TEXT,
    notes           TEXT,
    submitted_at    TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS perf_reviews_org_idx    ON public.performance_reviews(organization_id);
CREATE INDEX IF NOT EXISTS perf_reviews_emp_idx    ON public.performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS perf_reviews_period_idx ON public.performance_reviews(period);

CREATE TABLE IF NOT EXISTS public.performance_kpis (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   UUID        NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
    kpi_name    TEXT        NOT NULL,
    description TEXT,
    target      TEXT,
    actual      TEXT,
    score       NUMERIC(3,1),
    weight      NUMERIC(3,1) DEFAULT 1.0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requester_id       UUID        NOT NULL REFERENCES public.users(id),
    target_id          UUID        REFERENCES public.users(id),
    requester_shift_id UUID        NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
    target_shift_id    UUID        REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
    swap_type          TEXT        NOT NULL DEFAULT 'swap',
    reason             TEXT,
    status             TEXT        NOT NULL DEFAULT 'pending',
    manager_id         UUID        REFERENCES public.users(id),
    manager_note       TEXT,
    approved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_swap_org_idx       ON public.shift_swap_requests(organization_id);
CREATE INDEX IF NOT EXISTS shift_swap_requester_idx ON public.shift_swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS shift_swap_status_idx    ON public.shift_swap_requests(status);

-- ────────────────────────────────────────────────────────────
-- SECTION 13: Business Trips, Expense Claims
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_trips (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trip_date            DATE        NOT NULL,
    return_date          DATE,
    destination          TEXT        NOT NULL,
    purpose              TEXT        NOT NULL,
    transport_budget     NUMERIC(10,2) DEFAULT 0,
    accommodation_budget NUMERIC(10,2) DEFAULT 0,
    status               TEXT        NOT NULL DEFAULT 'pending',
    approved_by          UUID        REFERENCES public.users(id),
    approved_at          TIMESTAMPTZ,
    rejection_reason     TEXT,
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_trips_org    ON public.business_trips(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_trips_user   ON public.business_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_business_trips_status ON public.business_trips(status);

CREATE TABLE IF NOT EXISTS public.expense_claims (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_trip_id UUID        REFERENCES public.business_trips(id) ON DELETE SET NULL,
    claim_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
    category         TEXT        NOT NULL DEFAULT 'other',
    description      TEXT        NOT NULL,
    amount           NUMERIC(10,2) NOT NULL,
    currency         TEXT        NOT NULL DEFAULT 'TWD',
    receipt_url      TEXT,
    receipt_filename TEXT,
    status           TEXT        NOT NULL DEFAULT 'pending',
    approved_by      UUID        REFERENCES public.users(id),
    approved_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    reimbursed_at    TIMESTAMPTZ,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_claims_org    ON public.expense_claims(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_user   ON public.expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON public.expense_claims(status);

-- ────────────────────────────────────────────────────────────
-- SECTION 14: Documents (storage bucket + metadata)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-documents', 'employee-documents', false, 52428800,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "employee_docs_select" ON storage.objects;
CREATE POLICY "employee_docs_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'employee-documents');
DROP POLICY IF EXISTS "employee_docs_insert" ON storage.objects;
CREATE POLICY "employee_docs_insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'employee-documents');
DROP POLICY IF EXISTS "employee_docs_delete" ON storage.objects;
CREATE POLICY "employee_docs_delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'employee-documents');

CREATE TABLE IF NOT EXISTS public.employee_documents (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID,
    employee_id  UUID,
    doc_type     TEXT        NOT NULL,
    file_name    TEXT        NOT NULL,
    storage_path TEXT        NOT NULL,
    file_size    INTEGER,
    mime_type    TEXT,
    expiry_date  DATE,
    notes        TEXT,
    uploaded_by  UUID,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_read_docs"   ON public.employee_documents FOR SELECT USING (true);
CREATE POLICY "org_insert_docs" ON public.employee_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update_docs" ON public.employee_documents FOR UPDATE USING (true);
CREATE POLICY "org_delete_docs" ON public.employee_documents FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS emp_docs_org_emp_idx ON public.employee_documents(org_id, employee_id);
CREATE INDEX IF NOT EXISTS emp_docs_expiry_idx  ON public.employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- SECTION 15: Disciplinary + Training Records
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.disciplinary_records (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID,
    employee_id    UUID,
    type           TEXT,
    description    TEXT,
    issued_by      UUID,
    effective_date DATE,
    created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.disciplinary_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_disciplinary"  ON public.disciplinary_records FOR SELECT USING (true);
CREATE POLICY "write_disciplinary" ON public.disciplinary_records FOR ALL    USING (true);
CREATE INDEX IF NOT EXISTS disciplinary_org_emp_idx ON public.disciplinary_records(org_id, employee_id);

CREATE TABLE IF NOT EXISTS public.training_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID,
    employee_id     UUID,
    course_name     TEXT        NOT NULL,
    provider        TEXT,
    hours           NUMERIC(6,2),
    completion_date DATE,
    certificate_url TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_training"  ON public.training_records FOR SELECT USING (true);
CREATE POLICY "write_training" ON public.training_records FOR ALL    USING (true);
CREATE INDEX IF NOT EXISTS training_org_emp_idx ON public.training_records(org_id, employee_id);

-- ────────────────────────────────────────────────────────────
-- SECTION 16: Recruitment / ATS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_postings (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID,
    title        TEXT        NOT NULL,
    department   TEXT,
    location     TEXT,
    job_type     TEXT,
    status       TEXT        DEFAULT 'draft',
    description  TEXT,
    requirements TEXT,
    salary_min   INTEGER,
    salary_max   INTEGER,
    headcount    INTEGER     DEFAULT 1,
    posted_at    TIMESTAMPTZ,
    closes_at    DATE,
    created_by   UUID,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_jobs"  ON public.job_postings FOR SELECT USING (true);
CREATE POLICY "write_jobs" ON public.job_postings FOR ALL    USING (true);
CREATE INDEX IF NOT EXISTS job_postings_org_status_idx ON public.job_postings(org_id, status);

CREATE TABLE IF NOT EXISTS public.candidates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID,
    job_id      UUID        REFERENCES public.job_postings(id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    stage       TEXT        DEFAULT 'applied',
    source      TEXT,
    resume_path TEXT,
    notes       TEXT,
    rating      INTEGER,
    assigned_to UUID,
    created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_candidates"  ON public.candidates FOR SELECT USING (true);
CREATE POLICY "write_candidates" ON public.candidates FOR ALL    USING (true);
CREATE INDEX IF NOT EXISTS candidates_org_job_idx   ON public.candidates(org_id, job_id);
CREATE INDEX IF NOT EXISTS candidates_org_stage_idx ON public.candidates(org_id, stage);

CREATE TABLE IF NOT EXISTS public.interviews (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID,
    candidate_id   UUID        REFERENCES public.candidates(id) ON DELETE CASCADE,
    scheduled_at   TIMESTAMPTZ,
    interviewer_id UUID,
    interview_type TEXT,
    status         TEXT        DEFAULT 'scheduled',
    feedback       TEXT,
    score          INTEGER,
    created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_interviews"  ON public.interviews FOR SELECT USING (true);
CREATE POLICY "write_interviews" ON public.interviews FOR ALL    USING (true);
CREATE INDEX IF NOT EXISTS interviews_candidate_idx ON public.interviews(candidate_id, scheduled_at);

-- ────────────────────────────────────────────────────────────
-- SECTION 17: Users special indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_special_identities ON public.users USING GIN (special_identities);
CREATE INDEX IF NOT EXISTS users_reporting_to_idx       ON public.users(reporting_to);

COMMENT ON COLUMN public.users.special_identities IS
  'Taiwan Employment Services Act special employment identity categories';

-- ────────────────────────────────────────────────────────────
-- SECTION 18: RLS Policies (final org-scoped versions)
-- ────────────────────────────────────────────────────────────

-- workflow_instances
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_workflow_instances" ON public.workflow_instances;
DROP POLICY IF EXISTS "org_scope_workflow_instances" ON public.workflow_instances;
CREATE POLICY "org_scope_workflow_instances"
    ON public.workflow_instances FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_workflows" ON public.workflows;
DROP POLICY IF EXISTS "org_scope_workflows" ON public.workflows;
CREATE POLICY "org_scope_workflows"
    ON public.workflows FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- workflow_steps (via join)
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_workflow_steps" ON public.workflow_steps;
DROP POLICY IF EXISTS "org_scope_workflow_steps" ON public.workflow_steps;
CREATE POLICY "org_scope_workflow_steps"
    ON public.workflow_steps FOR ALL
    USING (
        auth.role() = 'anon'
        OR EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND w.organization_id = public.get_current_org_id())
    )
    WITH CHECK (
        auth.role() = 'anon'
        OR EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND w.organization_id = public.get_current_org_id())
    );

-- tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_tasks" ON public.tasks;
DROP POLICY IF EXISTS "org_scope_tasks" ON public.tasks;
CREATE POLICY "org_scope_tasks"
    ON public.tasks FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- overtime_requests
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_overtime_requests" ON public.overtime_requests;
CREATE POLICY "org_scope_overtime_requests"
    ON public.overtime_requests FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- punch_corrections
ALTER TABLE public.punch_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_punch_corrections" ON public.punch_corrections;
CREATE POLICY "org_scope_punch_corrections"
    ON public.punch_corrections FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- leave_balances
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_leave_balances" ON public.leave_balances;
CREATE POLICY "org_scope_leave_balances"
    ON public.leave_balances FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- salary_structures (admin/operations only)
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_scope_salary_structures" ON public.salary_structures;
CREATE POLICY "role_scope_salary_structures"
    ON public.salary_structures FOR ALL
    USING (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    )
    WITH CHECK (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    );

-- payroll_records (admin/operations only)
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_scope_payroll_records" ON public.payroll_records;
CREATE POLICY "role_scope_payroll_records"
    ON public.payroll_records FOR ALL
    USING (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    )
    WITH CHECK (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    );

-- payroll_runs (admin/operations only)
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_scope_payroll_runs" ON public.payroll_runs;
CREATE POLICY "role_scope_payroll_runs"
    ON public.payroll_runs FOR ALL
    USING (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    )
    WITH CHECK (
        auth.role() = 'anon'
        OR (org_id = public.get_current_org_id()
            AND (public.current_user_has_role('admin') OR public.current_user_has_role('operations')))
    );

-- insurance brackets (read for authenticated, write for service_role)
ALTER TABLE public.labor_ins_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_labor_brackets"  ON public.labor_ins_brackets  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_labor"  ON public.labor_ins_brackets  FOR ALL    TO service_role  USING (true);
ALTER TABLE public.health_ins_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_health_brackets" ON public.health_ins_brackets FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_health" ON public.health_ins_brackets FOR ALL    TO service_role  USING (true);

-- income_tax_brackets
ALTER TABLE public.income_tax_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_tax_brackets" ON public.income_tax_brackets FOR SELECT USING (true);

-- employee_dependents (org-scoped)
ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_employee_dependents" ON public.employee_dependents;
CREATE POLICY "org_scope_employee_dependents"
    ON public.employee_dependents FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- employee_position_history (org-scoped)
ALTER TABLE public.employee_position_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_emp_position_history" ON public.employee_position_history;
CREATE POLICY "org_scope_emp_position_history"
    ON public.employee_position_history FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- audit_logs (org-scoped)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_audit_logs" ON public.audit_logs;
CREATE POLICY "org_scope_audit_logs"
    ON public.audit_logs FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- performance_reviews (org-scoped)
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_perf_reviews" ON public.performance_reviews;
CREATE POLICY "org_scope_perf_reviews"
    ON public.performance_reviews FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- performance_kpis (org-scoped via join)
ALTER TABLE public.performance_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_perf_kpis" ON public.performance_kpis;
CREATE POLICY "org_scope_perf_kpis"
    ON public.performance_kpis FOR ALL
    USING (
        auth.role() = 'anon'
        OR EXISTS (SELECT 1 FROM public.performance_reviews pr WHERE pr.id = review_id AND pr.organization_id = public.get_current_org_id())
    )
    WITH CHECK (
        auth.role() = 'anon'
        OR EXISTS (SELECT 1 FROM public.performance_reviews pr WHERE pr.id = review_id AND pr.organization_id = public.get_current_org_id())
    );

-- shift_swap_requests (org-scoped)
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_shift_swaps" ON public.shift_swap_requests;
CREATE POLICY "org_scope_shift_swaps"
    ON public.shift_swap_requests FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- business_trips (org-scoped)
ALTER TABLE public.business_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_business_trips" ON public.business_trips;
CREATE POLICY "org_scope_business_trips"
    ON public.business_trips FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- expense_claims (org-scoped)
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_scope_expense_claims" ON public.expense_claims;
CREATE POLICY "org_scope_expense_claims"
    ON public.expense_claims FOR ALL
    USING  (auth.role() = 'anon' OR organization_id = public.get_current_org_id())
    WITH CHECK (auth.role() = 'anon' OR organization_id = public.get_current_org_id());

-- roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_read_roles"    ON public.roles FOR SELECT USING (true);
CREATE POLICY "admin_write_roles" ON public.roles FOR INSERT WITH CHECK (auth.role() = 'anon' OR public.current_user_has_role('admin'));
CREATE POLICY "admin_update_roles" ON public.roles FOR UPDATE USING (auth.role() = 'anon' OR public.current_user_has_role('admin'));

-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_user_roles"
    ON public.user_roles FOR SELECT
    USING (
        auth.role() = 'anon'
        OR user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        OR public.current_user_has_role('admin')
    );
CREATE POLICY "admin_write_user_roles"
    ON public.user_roles FOR INSERT
    WITH CHECK (auth.role() = 'anon' OR public.current_user_has_role('admin'));
CREATE POLICY "admin_delete_user_roles"
    ON public.user_roles FOR DELETE
    USING (auth.role() = 'anon' OR public.current_user_has_role('admin'));

-- module_access
ALTER TABLE public.module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_read_module_access"
    ON public.module_access FOR SELECT
    USING (auth.role() = 'anon' OR organization_id = public.get_current_org_id());
CREATE POLICY "admin_write_module_access"
    ON public.module_access FOR INSERT
    WITH CHECK (auth.role() = 'anon' OR (organization_id = public.get_current_org_id() AND public.current_user_has_role('admin')));
CREATE POLICY "admin_update_module_access"
    ON public.module_access FOR UPDATE
    USING (auth.role() = 'anon' OR (organization_id = public.get_current_org_id() AND public.current_user_has_role('admin')))
    WITH CHECK (auth.role() = 'anon' OR (organization_id = public.get_current_org_id() AND public.current_user_has_role('admin')));
CREATE POLICY "admin_delete_module_access"
    ON public.module_access FOR DELETE
    USING (auth.role() = 'anon' OR (organization_id = public.get_current_org_id() AND public.current_user_has_role('admin')));

-- ────────────────────────────────────────────────────────────
-- SECTION 19: Data Retention — Anonymization Function
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.archive_and_anonymize_terminated_employees()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.users
    SET
        first_name              = '[ANONYMIZED]',
        last_name               = '[ANONYMIZED]',
        english_name            = NULL,
        id_number               = '[ANONYMIZED]',
        address                 = NULL,
        phone                   = NULL,
        emergency_contact_name  = NULL,
        emergency_contact_phone = NULL,
        bank_code               = NULL,
        bank_account            = NULL,
        birth_date              = NULL,
        is_archived             = true,
        updated_at              = now()
    WHERE
        resign_date IS NOT NULL
        AND resign_date < (CURRENT_DATE - INTERVAL '5 years')
        AND (is_archived IS NULL OR is_archived = false);
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'quarterly_pdpa_anonymize',
            '0 0 1 1,4,7,10 *',
            $$SELECT public.archive_and_anonymize_terminated_employees()$$
        );
    END IF;
END$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 20: Seed Data
-- ────────────────────────────────────────────────────────────

-- Roles
INSERT INTO public.roles (role_name, description) VALUES
    ('admin',      '系統管理員 — full access'),
    ('manager',    '門市主管 — store management'),
    ('staff',      '員工 — basic access'),
    ('operations', '營運 — HR + payroll access')
ON CONFLICT (role_name) DO NOTHING;

-- Income tax brackets (Taiwan 2024 monthly withholding)
INSERT INTO public.income_tax_brackets
    (min_salary, max_salary, tax_rate, fixed_amount, description)
VALUES
    (0,      88500,  0.0000, 0, '免稅 (below threshold)'),
    (88501,  111000, 0.0500, 0, '5% 級距'),
    (111001, 139500, 0.1000, 0, '10% 級距'),
    (139501, 166500, 0.1500, 0, '15% 級距'),
    (166501, 222000, 0.2000, 0, '20% 級距'),
    (222001, NULL,   0.3000, 0, '30% 級距')
ON CONFLICT DO NOTHING;

-- Agent registry
INSERT INTO public.agent_registry
    (team_name, agent_name, description, description_en, endpoint, io_contract, model, sort_order)
VALUES
    ('documentation', 'flow-analyzer',
     '讀取頁面清單，萃取每頁的使用者操作流程與業務邏輯',
     'Reads page manifests and extracts user/operational flows per page',
     'doc-flow-analyzer',
     '{"input":{"page_manifest":"array of page definitions"},"output":{"flows":"array of flow objects per page"}}'::jsonb,
     'qwen3.5-plus', 1),
    ('documentation', 'content-generator',
     '根據流程分析結果，撰寫繁中/英雙語操作指南 Markdown 文章',
     'Generates bilingual zh-TW + en Markdown guides from flow analysis',
     'doc-content-gen',
     '{"input":{"flows":"array of flow objects"},"output":{"articles":"array of bilingual article objects"}}'::jsonb,
     'qwen3.5-plus', 2),
    ('documentation', 'indexer',
     '將文章寫入 help_articles 表，建立 PostgreSQL 全文檢索索引',
     'Stores articles in help_articles with PostgreSQL FTS tsvector index',
     'doc-indexer',
     '{"input":{"articles":"array of bilingual article objects"},"output":{"indexed_count":"integer","article_ids":"array of UUIDs"}}'::jsonb,
     'none', 3),
    ('documentation', 'help-chatbot',
     'RAG 問答：FTS 檢索上下文，Claude 生成高品質雙語回答',
     'RAG chatbot: FTS retrieval + Claude claude-opus-4-6 for bilingual answers',
     'help-chatbot',
     '{"input":{"question":"string","locale":"zh-TW|en","context":"message array"},"output":{"answer":"string","sources":"array of article refs"}}'::jsonb,
     'claude-opus-4-6', 4)
ON CONFLICT DO NOTHING;

-- Module access seed for all active orgs
INSERT INTO public.module_access
    (organization_id, module_key, module_name_zh, module_name_en, icon, is_enabled, required_role, sort_order)
SELECT o.id, m.module_key, m.name_zh, m.name_en, m.icon, true, m.required_role, m.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
    ('dashboard',           '儀表板',        'Dashboard',         '📊', 'all',        1),
    ('manager-dashboard',   '營運看板',       'Ops Dashboard',     '🎯', 'manager',    2),
    ('hr-dashboard',        'HR 報表',        'HR Dashboard',      '📊', 'operations', 3),
    ('time-tracker',        '打卡追蹤',       'Time Tracker',      '⏱',  'staff',      4),
    ('leave-management',    '請假管理',       'Leave Mgmt',        '🌴', 'staff',      5),
    ('overtime-requests',   '加班申請',       'Overtime',          '⏰', 'staff',      6),
    ('payroll',             '薪資管理',       'Payroll',           '💰', 'operations', 7),
    ('scheduling',          '排班',          'Scheduling',        '📅', 'manager',    8),
    ('holidays',            '假日管理',       'Holidays',          '🗓', 'manager',    9),
    ('shift-rules',         '排班規則',       'Shift Rules',       '⚖️', 'manager',   10),
    ('workflow-management', '流程管理',       'Workflow Mgmt',     '🔄', 'manager',   11),
    ('org-management',      '組織管理',       'Org Management',    '🏢', 'admin',     12),
    ('triggers',            '觸發器',         'Triggers',          '⚡', 'admin',     13),
    ('notifications',       '通知管理',       'Notifications',     '🔔', 'manager',   14),
    ('users',               '使用者管理',     'Users',             '👤', 'admin',     15),
    ('admin',               '系統設定',       'Admin Settings',    '⚙️', 'admin',     16),
    ('help-center',         '說明中心',       'Help Center',       '📚', 'all',       17),
    ('agent-console',       'Agent 控制台',   'Agent Console',     '🤖', 'admin',     18),
    ('line',                'LINE 管理',      'LINE Management',   '💬', 'manager',   19),
    ('audit-logs',          '操作紀錄',       'Audit Logs',        '🔍', 'admin',     20),
    ('performance',         '績效管理',       'Performance',       '⭐', 'manager',   21),
    ('business-trips',      '公出差旅',       'Business Trips',    '✈️',  'staff',     22),
    ('expense-claims',      '費用核銷',       'Expense Claims',    '🧾', 'staff',     23)
) AS m(module_key, name_zh, name_en, icon, required_role, sort_order)
WHERE o.status = 'active'
ON CONFLICT ON CONSTRAINT module_access_org_key_unique DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- SECTION 21: Insurance Bracket Seed Data (2020–2026)
-- ────────────────────────────────────────────────────────────

-- LABOR INSURANCE (勞保)
INSERT INTO public.labor_ins_brackets (year, grade, min_salary, insured_salary, employee_premium, employer_premium)
SELECT year::INT, grade::INT, min_salary::NUMERIC, insured_salary::NUMERIC,
       ROUND(insured_salary * emp_rate)::NUMERIC, ROUND(insured_salary * er_rate)::NUMERIC
FROM (VALUES
    -- 2020  Total 11.0%  emp=2.2%  er=7.7%
    (2020, 0.022::NUMERIC, 0.077::NUMERIC,  1,     0, 23800),
    (2020, 0.022,          0.077,           2, 23801, 24000),
    (2020, 0.022,          0.077,           3, 24001, 25200),
    (2020, 0.022,          0.077,           4, 25201, 26400),
    (2020, 0.022,          0.077,           5, 26401, 27600),
    (2020, 0.022,          0.077,           6, 27601, 28800),
    (2020, 0.022,          0.077,           7, 28801, 30300),
    (2020, 0.022,          0.077,           8, 30301, 31800),
    (2020, 0.022,          0.077,           9, 31801, 33300),
    (2020, 0.022,          0.077,          10, 33301, 34800),
    (2020, 0.022,          0.077,          11, 34801, 36300),
    (2020, 0.022,          0.077,          12, 36301, 38200),
    (2020, 0.022,          0.077,          13, 38201, 40100),
    (2020, 0.022,          0.077,          14, 40101, 42000),
    (2020, 0.022,          0.077,          15, 42001, 43900),
    (2020, 0.022,          0.077,          16, 43901, 45800),
    -- 2021  Total 11.5%  emp=2.3%  er=8.05%
    (2021, 0.023::NUMERIC, 0.0805::NUMERIC,  1,     0, 24000),
    (2021, 0.023,          0.0805,           2, 24001, 25200),
    (2021, 0.023,          0.0805,           3, 25201, 26400),
    (2021, 0.023,          0.0805,           4, 26401, 27600),
    (2021, 0.023,          0.0805,           5, 27601, 28800),
    (2021, 0.023,          0.0805,           6, 28801, 30300),
    (2021, 0.023,          0.0805,           7, 30301, 31800),
    (2021, 0.023,          0.0805,           8, 31801, 33300),
    (2021, 0.023,          0.0805,           9, 33301, 34800),
    (2021, 0.023,          0.0805,          10, 34801, 36300),
    (2021, 0.023,          0.0805,          11, 36301, 38200),
    (2021, 0.023,          0.0805,          12, 38201, 40100),
    (2021, 0.023,          0.0805,          13, 40101, 42000),
    (2021, 0.023,          0.0805,          14, 42001, 43900),
    (2021, 0.023,          0.0805,          15, 43901, 45800),
    -- 2022  Total 11.5%  emp=2.3%  er=8.05%
    (2022, 0.023::NUMERIC, 0.0805::NUMERIC,  1,     0, 25250),
    (2022, 0.023,          0.0805,           2, 25251, 26400),
    (2022, 0.023,          0.0805,           3, 26401, 27600),
    (2022, 0.023,          0.0805,           4, 27601, 28800),
    (2022, 0.023,          0.0805,           5, 28801, 30300),
    (2022, 0.023,          0.0805,           6, 30301, 31800),
    (2022, 0.023,          0.0805,           7, 31801, 33300),
    (2022, 0.023,          0.0805,           8, 33301, 34800),
    (2022, 0.023,          0.0805,           9, 34801, 36300),
    (2022, 0.023,          0.0805,          10, 36301, 38200),
    (2022, 0.023,          0.0805,          11, 38201, 40100),
    (2022, 0.023,          0.0805,          12, 40101, 42000),
    (2022, 0.023,          0.0805,          13, 42001, 43900),
    (2022, 0.023,          0.0805,          14, 43901, 45800),
    -- 2023  Total 12.0%  emp=2.4%  er=8.4%
    (2023, 0.024::NUMERIC, 0.084::NUMERIC,  1,     0, 26400),
    (2023, 0.024,          0.084,           2, 26401, 27600),
    (2023, 0.024,          0.084,           3, 27601, 28800),
    (2023, 0.024,          0.084,           4, 28801, 30300),
    (2023, 0.024,          0.084,           5, 30301, 31800),
    (2023, 0.024,          0.084,           6, 31801, 33300),
    (2023, 0.024,          0.084,           7, 33301, 34800),
    (2023, 0.024,          0.084,           8, 34801, 36300),
    (2023, 0.024,          0.084,           9, 36301, 38200),
    (2023, 0.024,          0.084,          10, 38201, 40100),
    (2023, 0.024,          0.084,          11, 40101, 42000),
    (2023, 0.024,          0.084,          12, 42001, 43900),
    (2023, 0.024,          0.084,          13, 43901, 45800),
    -- 2024  Total 12.0%  emp=2.4%  er=8.4%
    (2024, 0.024::NUMERIC, 0.084::NUMERIC,  1,     0, 27470),
    (2024, 0.024,          0.084,           2, 27471, 28800),
    (2024, 0.024,          0.084,           3, 28801, 30300),
    (2024, 0.024,          0.084,           4, 30301, 31800),
    (2024, 0.024,          0.084,           5, 31801, 33300),
    (2024, 0.024,          0.084,           6, 33301, 34800),
    (2024, 0.024,          0.084,           7, 34801, 36300),
    (2024, 0.024,          0.084,           8, 36301, 38200),
    (2024, 0.024,          0.084,           9, 38201, 40100),
    (2024, 0.024,          0.084,          10, 40101, 42000),
    (2024, 0.024,          0.084,          11, 42001, 43900),
    (2024, 0.024,          0.084,          12, 43901, 45800),
    -- 2025  Total 12.5%  emp=2.5%  er=8.75%
    (2025, 0.025::NUMERIC, 0.0875::NUMERIC,  1,     0, 28590),
    (2025, 0.025,          0.0875,           2, 28591, 28800),
    (2025, 0.025,          0.0875,           3, 28801, 30300),
    (2025, 0.025,          0.0875,           4, 30301, 31800),
    (2025, 0.025,          0.0875,           5, 31801, 33300),
    (2025, 0.025,          0.0875,           6, 33301, 34800),
    (2025, 0.025,          0.0875,           7, 34801, 36300),
    (2025, 0.025,          0.0875,           8, 36301, 38200),
    (2025, 0.025,          0.0875,           9, 38201, 40100),
    (2025, 0.025,          0.0875,          10, 40101, 42000),
    (2025, 0.025,          0.0875,          11, 42001, 43900),
    (2025, 0.025,          0.0875,          12, 43901, 45800),
    -- 2026  Total 12.5%  emp=2.5%  er=8.75%
    (2026, 0.025::NUMERIC, 0.0875::NUMERIC,  1,     0, 29500),
    (2026, 0.025,          0.0875,           2, 29501, 31800),
    (2026, 0.025,          0.0875,           3, 31801, 33300),
    (2026, 0.025,          0.0875,           4, 33301, 34800),
    (2026, 0.025,          0.0875,           5, 34801, 36300),
    (2026, 0.025,          0.0875,           6, 36301, 38200),
    (2026, 0.025,          0.0875,           7, 38201, 40100),
    (2026, 0.025,          0.0875,           8, 40101, 42000),
    (2026, 0.025,          0.0875,           9, 42001, 43900),
    (2026, 0.025,          0.0875,          10, 43901, 45800),
    (2026, 0.025,          0.0875,          11, 45801, 45800)
) AS t(year, emp_rate, er_rate, grade, min_salary, insured_salary);

-- HEALTH INSURANCE (健保)
INSERT INTO public.health_ins_brackets (year, grade, min_salary, insured_salary, employee_premium, employer_premium)
SELECT year::INT, grade::INT, min_salary::NUMERIC, insured_salary::NUMERIC,
       ROUND(insured_salary * emp_rate)::NUMERIC, ROUND(insured_salary * er_rate)::NUMERIC
FROM (VALUES
    -- 2020  Total 4.69%  emp=1.407%  er=2.814%
    (2020, 0.01407::NUMERIC, 0.02814::NUMERIC,  1,     0, 23800),
    (2020, 0.01407,          0.02814,           2, 23801, 24000),
    (2020, 0.01407,          0.02814,           3, 24001, 25200),
    (2020, 0.01407,          0.02814,           4, 25201, 26400),
    (2020, 0.01407,          0.02814,           5, 26401, 27600),
    (2020, 0.01407,          0.02814,           6, 27601, 28800),
    (2020, 0.01407,          0.02814,           7, 28801, 30300),
    (2020, 0.01407,          0.02814,           8, 30301, 31800),
    (2020, 0.01407,          0.02814,           9, 31801, 33300),
    (2020, 0.01407,          0.02814,          10, 33301, 34800),
    (2020, 0.01407,          0.02814,          11, 34801, 36300),
    (2020, 0.01407,          0.02814,          12, 36301, 38200),
    (2020, 0.01407,          0.02814,          13, 38201, 40100),
    (2020, 0.01407,          0.02814,          14, 40101, 42000),
    (2020, 0.01407,          0.02814,          15, 42001, 43900),
    (2020, 0.01407,          0.02814,          16, 43901, 45800),
    (2020, 0.01407,          0.02814,          17, 45801,  48200),
    (2020, 0.01407,          0.02814,          18, 48201,  50600),
    (2020, 0.01407,          0.02814,          19, 50601,  53000),
    (2020, 0.01407,          0.02814,          20, 53001,  55400),
    (2020, 0.01407,          0.02814,          21, 55401,  57800),
    (2020, 0.01407,          0.02814,          22, 57801,  60800),
    (2020, 0.01407,          0.02814,          23, 60801,  63800),
    (2020, 0.01407,          0.02814,          24, 63801,  66800),
    (2020, 0.01407,          0.02814,          25, 66801,  69800),
    (2020, 0.01407,          0.02814,          26, 69801,  72800),
    (2020, 0.01407,          0.02814,          27, 72801,  76500),
    (2020, 0.01407,          0.02814,          28, 76501,  80200),
    (2020, 0.01407,          0.02814,          29, 80201,  83900),
    (2020, 0.01407,          0.02814,          30, 83901,  87600),
    (2020, 0.01407,          0.02814,          31, 87601,  92100),
    (2020, 0.01407,          0.02814,          32, 92101,  97700),
    (2020, 0.01407,          0.02814,          33, 97701, 103300),
    -- 2021  Total 5.17%  emp=1.551%  er=3.102%
    (2021, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 24000),
    (2021, 0.01551,          0.03102,           2, 24001, 25200),
    (2021, 0.01551,          0.03102,           3, 25201, 26400),
    (2021, 0.01551,          0.03102,           4, 26401, 27600),
    (2021, 0.01551,          0.03102,           5, 27601, 28800),
    (2021, 0.01551,          0.03102,           6, 28801, 30300),
    (2021, 0.01551,          0.03102,           7, 30301, 31800),
    (2021, 0.01551,          0.03102,           8, 31801, 33300),
    (2021, 0.01551,          0.03102,           9, 33301, 34800),
    (2021, 0.01551,          0.03102,          10, 34801, 36300),
    (2021, 0.01551,          0.03102,          11, 36301, 38200),
    (2021, 0.01551,          0.03102,          12, 38201, 40100),
    (2021, 0.01551,          0.03102,          13, 40101, 42000),
    (2021, 0.01551,          0.03102,          14, 42001, 43900),
    (2021, 0.01551,          0.03102,          15, 43901, 45800),
    (2021, 0.01551,          0.03102,          16, 45801,  48200),
    (2021, 0.01551,          0.03102,          17, 48201,  50600),
    (2021, 0.01551,          0.03102,          18, 50601,  53000),
    (2021, 0.01551,          0.03102,          19, 53001,  55400),
    (2021, 0.01551,          0.03102,          20, 55401,  57800),
    (2021, 0.01551,          0.03102,          21, 57801,  60800),
    (2021, 0.01551,          0.03102,          22, 60801,  63800),
    (2021, 0.01551,          0.03102,          23, 63801,  66800),
    (2021, 0.01551,          0.03102,          24, 66801,  69800),
    (2021, 0.01551,          0.03102,          25, 69801,  72800),
    (2021, 0.01551,          0.03102,          26, 72801,  76500),
    (2021, 0.01551,          0.03102,          27, 76501,  80200),
    (2021, 0.01551,          0.03102,          28, 80201,  83900),
    (2021, 0.01551,          0.03102,          29, 83901,  87600),
    (2021, 0.01551,          0.03102,          30, 87601,  92100),
    (2021, 0.01551,          0.03102,          31, 92101,  97700),
    (2021, 0.01551,          0.03102,          32, 97701, 103300),
    -- 2022  Total 5.17%  emp=1.551%  er=3.102%
    (2022, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 25250),
    (2022, 0.01551,          0.03102,           2, 25251, 26400),
    (2022, 0.01551,          0.03102,           3, 26401, 27600),
    (2022, 0.01551,          0.03102,           4, 27601, 28800),
    (2022, 0.01551,          0.03102,           5, 28801, 30300),
    (2022, 0.01551,          0.03102,           6, 30301, 31800),
    (2022, 0.01551,          0.03102,           7, 31801, 33300),
    (2022, 0.01551,          0.03102,           8, 33301, 34800),
    (2022, 0.01551,          0.03102,           9, 34801, 36300),
    (2022, 0.01551,          0.03102,          10, 36301, 38200),
    (2022, 0.01551,          0.03102,          11, 38201, 40100),
    (2022, 0.01551,          0.03102,          12, 40101, 42000),
    (2022, 0.01551,          0.03102,          13, 42001, 43900),
    (2022, 0.01551,          0.03102,          14, 43901, 45800),
    (2022, 0.01551,          0.03102,          15, 45801,  48200),
    (2022, 0.01551,          0.03102,          16, 48201,  50600),
    (2022, 0.01551,          0.03102,          17, 50601,  53000),
    (2022, 0.01551,          0.03102,          18, 53001,  55400),
    (2022, 0.01551,          0.03102,          19, 55401,  57800),
    (2022, 0.01551,          0.03102,          20, 57801,  60800),
    (2022, 0.01551,          0.03102,          21, 60801,  63800),
    (2022, 0.01551,          0.03102,          22, 63801,  66800),
    (2022, 0.01551,          0.03102,          23, 66801,  69800),
    (2022, 0.01551,          0.03102,          24, 69801,  72800),
    (2022, 0.01551,          0.03102,          25, 72801,  76500),
    (2022, 0.01551,          0.03102,          26, 76501,  80200),
    (2022, 0.01551,          0.03102,          27, 80201,  83900),
    (2022, 0.01551,          0.03102,          28, 83901,  87600),
    (2022, 0.01551,          0.03102,          29, 87601,  92100),
    (2022, 0.01551,          0.03102,          30, 92101,  97700),
    (2022, 0.01551,          0.03102,          31, 97701, 103300),
    -- 2023  Total 5.17%  emp=1.551%  er=3.102%
    (2023, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 26400),
    (2023, 0.01551,          0.03102,           2, 26401, 27600),
    (2023, 0.01551,          0.03102,           3, 27601, 28800),
    (2023, 0.01551,          0.03102,           4, 28801, 30300),
    (2023, 0.01551,          0.03102,           5, 30301, 31800),
    (2023, 0.01551,          0.03102,           6, 31801, 33300),
    (2023, 0.01551,          0.03102,           7, 33301, 34800),
    (2023, 0.01551,          0.03102,           8, 34801, 36300),
    (2023, 0.01551,          0.03102,           9, 36301, 38200),
    (2023, 0.01551,          0.03102,          10, 38201, 40100),
    (2023, 0.01551,          0.03102,          11, 40101, 42000),
    (2023, 0.01551,          0.03102,          12, 42001, 43900),
    (2023, 0.01551,          0.03102,          13, 43901, 45800),
    (2023, 0.01551,          0.03102,          14, 45801,  48200),
    (2023, 0.01551,          0.03102,          15, 48201,  50600),
    (2023, 0.01551,          0.03102,          16, 50601,  53000),
    (2023, 0.01551,          0.03102,          17, 53001,  55400),
    (2023, 0.01551,          0.03102,          18, 55401,  57800),
    (2023, 0.01551,          0.03102,          19, 57801,  60800),
    (2023, 0.01551,          0.03102,          20, 60801,  63800),
    (2023, 0.01551,          0.03102,          21, 63801,  66800),
    (2023, 0.01551,          0.03102,          22, 66801,  69800),
    (2023, 0.01551,          0.03102,          23, 69801,  72800),
    (2023, 0.01551,          0.03102,          24, 72801,  76500),
    (2023, 0.01551,          0.03102,          25, 76501,  80200),
    (2023, 0.01551,          0.03102,          26, 80201,  83900),
    (2023, 0.01551,          0.03102,          27, 83901,  87600),
    (2023, 0.01551,          0.03102,          28, 87601,  92100),
    (2023, 0.01551,          0.03102,          29, 92101,  97700),
    (2023, 0.01551,          0.03102,          30, 97701, 103300),
    -- 2024  Total 5.17%  emp=1.551%  er=3.102%
    (2024, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 27470),
    (2024, 0.01551,          0.03102,           2, 27471, 28800),
    (2024, 0.01551,          0.03102,           3, 28801, 30300),
    (2024, 0.01551,          0.03102,           4, 30301, 31800),
    (2024, 0.01551,          0.03102,           5, 31801, 33300),
    (2024, 0.01551,          0.03102,           6, 33301, 34800),
    (2024, 0.01551,          0.03102,           7, 34801, 36300),
    (2024, 0.01551,          0.03102,           8, 36301, 38200),
    (2024, 0.01551,          0.03102,           9, 38201, 40100),
    (2024, 0.01551,          0.03102,          10, 40101, 42000),
    (2024, 0.01551,          0.03102,          11, 42001, 43900),
    (2024, 0.01551,          0.03102,          12, 43901, 45800),
    (2024, 0.01551,          0.03102,          13, 45801,  48200),
    (2024, 0.01551,          0.03102,          14, 48201,  50600),
    (2024, 0.01551,          0.03102,          15, 50601,  53000),
    (2024, 0.01551,          0.03102,          16, 53001,  55400),
    (2024, 0.01551,          0.03102,          17, 55401,  57800),
    (2024, 0.01551,          0.03102,          18, 57801,  60800),
    (2024, 0.01551,          0.03102,          19, 60801,  63800),
    (2024, 0.01551,          0.03102,          20, 63801,  66800),
    (2024, 0.01551,          0.03102,          21, 66801,  69800),
    (2024, 0.01551,          0.03102,          22, 69801,  72800),
    (2024, 0.01551,          0.03102,          23, 72801,  76500),
    (2024, 0.01551,          0.03102,          24, 76501,  80200),
    (2024, 0.01551,          0.03102,          25, 80201,  83900),
    (2024, 0.01551,          0.03102,          26, 83901,  87600),
    (2024, 0.01551,          0.03102,          27, 87601,  92100),
    (2024, 0.01551,          0.03102,          28, 92101,  97700),
    (2024, 0.01551,          0.03102,          29, 97701, 103300),
    -- 2025  Total 5.17%  emp=1.551%  er=3.102%
    (2025, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 28590),
    (2025, 0.01551,          0.03102,           2, 28591, 28800),
    (2025, 0.01551,          0.03102,           3, 28801, 30300),
    (2025, 0.01551,          0.03102,           4, 30301, 31800),
    (2025, 0.01551,          0.03102,           5, 31801, 33300),
    (2025, 0.01551,          0.03102,           6, 33301, 34800),
    (2025, 0.01551,          0.03102,           7, 34801, 36300),
    (2025, 0.01551,          0.03102,           8, 36301, 38200),
    (2025, 0.01551,          0.03102,           9, 38201, 40100),
    (2025, 0.01551,          0.03102,          10, 40101, 42000),
    (2025, 0.01551,          0.03102,          11, 42001, 43900),
    (2025, 0.01551,          0.03102,          12, 43901, 45800),
    (2025, 0.01551,          0.03102,          13, 45801,  48200),
    (2025, 0.01551,          0.03102,          14, 48201,  50600),
    (2025, 0.01551,          0.03102,          15, 50601,  53000),
    (2025, 0.01551,          0.03102,          16, 53001,  55400),
    (2025, 0.01551,          0.03102,          17, 55401,  57800),
    (2025, 0.01551,          0.03102,          18, 57801,  60800),
    (2025, 0.01551,          0.03102,          19, 60801,  63800),
    (2025, 0.01551,          0.03102,          20, 63801,  66800),
    (2025, 0.01551,          0.03102,          21, 66801,  69800),
    (2025, 0.01551,          0.03102,          22, 69801,  72800),
    (2025, 0.01551,          0.03102,          23, 72801,  76500),
    (2025, 0.01551,          0.03102,          24, 76501,  80200),
    (2025, 0.01551,          0.03102,          25, 80201,  83900),
    (2025, 0.01551,          0.03102,          26, 83901,  87600),
    (2025, 0.01551,          0.03102,          27, 87601,  92100),
    (2025, 0.01551,          0.03102,          28, 92101,  97700),
    (2025, 0.01551,          0.03102,          29, 97701, 103300),
    -- 2026  Total 5.17%  emp=1.551%  er=3.102%
    (2026, 0.01551::NUMERIC, 0.03102::NUMERIC,  1,     0, 29500),
    (2026, 0.01551,          0.03102,           2, 29501, 31800),
    (2026, 0.01551,          0.03102,           3, 31801, 33300),
    (2026, 0.01551,          0.03102,           4, 33301, 34800),
    (2026, 0.01551,          0.03102,           5, 34801, 36300),
    (2026, 0.01551,          0.03102,           6, 36301, 38200),
    (2026, 0.01551,          0.03102,           7, 38201, 40100),
    (2026, 0.01551,          0.03102,           8, 40101, 42000),
    (2026, 0.01551,          0.03102,           9, 42001, 43900),
    (2026, 0.01551,          0.03102,          10, 43901, 45800),
    (2026, 0.01551,          0.03102,          11, 45801,  48200),
    (2026, 0.01551,          0.03102,          12, 48201,  50600),
    (2026, 0.01551,          0.03102,          13, 50601,  53000),
    (2026, 0.01551,          0.03102,          14, 53001,  55400),
    (2026, 0.01551,          0.03102,          15, 55401,  57800),
    (2026, 0.01551,          0.03102,          16, 57801,  60800),
    (2026, 0.01551,          0.03102,          17, 60801,  63800),
    (2026, 0.01551,          0.03102,          18, 63801,  66800),
    (2026, 0.01551,          0.03102,          19, 66801,  69800),
    (2026, 0.01551,          0.03102,          20, 69801,  72800),
    (2026, 0.01551,          0.03102,          21, 72801,  76500),
    (2026, 0.01551,          0.03102,          22, 76501,  80200),
    (2026, 0.01551,          0.03102,          23, 80201,  83900),
    (2026, 0.01551,          0.03102,          24, 83901,  87600),
    (2026, 0.01551,          0.03102,          25, 87601,  92100),
    (2026, 0.01551,          0.03102,          26, 92101,  97700),
    (2026, 0.01551,          0.03102,          27, 97701, 103300)
) AS t(year, emp_rate, er_rate, grade, min_salary, insured_salary);
