-- ============================================================
-- HRM Features: Payroll Columns, Training Cert Fields,
--   Approval Chains, Module Access Registration
-- Source: hrm_gaps (minus work_permit + minus redundant CREATEs)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Payroll Records — Additional Columns
-- ════════════════════════════════════════════════════════════

-- Supplementary NHI premium field
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS supplementary_nhi NUMERIC(10,2) DEFAULT 0;

-- Leave buyout amount
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS leave_buyout NUMERIC(10,2) DEFAULT 0;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Training Records — Certification Tracking
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.training_records ADD COLUMN IF NOT EXISTS cert_type TEXT;
ALTER TABLE public.training_records ADD COLUMN IF NOT EXISTS expiry_date DATE;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Multi-Level Approval Chains
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_chains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    module          TEXT NOT NULL,          -- 'leave' | 'overtime' | 'expense'
    level           INTEGER NOT NULL DEFAULT 1,
    approver_role   TEXT NOT NULL,          -- 'manager' | 'director' | 'hr'
    min_days        NUMERIC(5,2),           -- e.g. leave >= 3 days triggers this level
    min_amount      NUMERIC(12,2),          -- e.g. expense >= 10000 triggers this level
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, module, level)
);
ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_approval_chains" ON public.approval_chains FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Module Access Registration (new modules)
-- ════════════════════════════════════════════════════════════

INSERT INTO public.module_access (organization_id, module_key, module_name_zh, module_name_en, is_enabled, required_role, sort_order)
SELECT o.id, v.module_key, v.module_name_zh, v.module_name_en, true, v.required_role, v.sort_order
FROM organizations o
CROSS JOIN (VALUES
    ('documents',    '文件管理',   'Documents',       'manager', 60),
    ('line-logs',    'LINE 記錄',  'LINE Logs',       'admin',   70),
    ('recruitment',  '招募管理',   'Recruitment',     'manager', 55),
    ('onboarding',   '到職離職',   'Onboarding',      'manager', 56),
    ('announcements','公告管理',   'Announcements',   'manager', 57),
    ('training',     '教育訓練',   'Training',        'manager', 58),
    ('disciplinary', '獎懲紀錄',   'Disciplinary',    'manager', 59)
) AS v(module_key, module_name_zh, module_name_en, required_role, sort_order)
ON CONFLICT DO NOTHING;
