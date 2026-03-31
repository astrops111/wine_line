-- ============================================================
-- Onboarding & Offboarding Checklists
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'onboarding', -- 'onboarding' | 'offboarding'
  items JSONB NOT NULL DEFAULT '[]', -- [{title, description, assignee_role, due_days}]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES onboarding_templates(id),
  type TEXT NOT NULL DEFAULT 'onboarding',
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  due_date DATE,
  status TEXT DEFAULT 'pending', -- 'pending' | 'completed'
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
