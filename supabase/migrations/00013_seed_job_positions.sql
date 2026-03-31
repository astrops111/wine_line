-- ============================================================
-- SEED: Job Positions (61 positions — 16 active, 45 inactive)
-- Source: job_positions.sql (INSERT part)
-- ============================================================

DO $$
DECLARE
  org_id UUID;
BEGIN
  SELECT id INTO org_id FROM public.organizations LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found';
  END IF;

  INSERT INTO public.job_positions
    (organization_id, title, job_grade, is_supervisory, is_active, required_count, current_count, shortage, position_allowance)
  VALUES
    -- ── Active job roles (16) ──
    (org_id, '創辦人(老闆)', NULL, true,  true,  1,  1,  0,    0),
    (org_id, '執行長',       NULL, true,  true,  1,  1,  0,    0),
    (org_id, '經理',         NULL, true,  true,  1,  2,  0,    0),
    (org_id, '專員',         NULL, false, true,  1,  4,  0,    0),
    (org_id, '店長',         NULL, true,  true,  1,  5,  0,    0),
    (org_id, '主任',         NULL, true,  true,  1,  3,  0,    0),
    (org_id, '門市兼職人員', NULL, false, true,  1, 31,  0,    0),
    (org_id, '門市正職人員', NULL, false, true,  0, 29,  1,    0),
    (org_id, '視覺設計',     NULL, false, true,  1,  2,  0,    0),
    (org_id, '採購',         NULL, false, true,  1,  1,  0,    0),
    (org_id, '企劃經理',     NULL, false, true,  0,  1,  0,    0),
    (org_id, '督導',         NULL, true,  true,  0,  2,  0,    0),
    (org_id, '區督導',       NULL, true,  true,  0,  1,  0,    0),
    (org_id, '火腿師傅',     NULL, false, true,  2,  1,  1,    0),
    (org_id, '行銷',         NULL, false, true,  0,  1,  0,    0),
    (org_id, '稽核人員',     NULL, false, true,  0,  1,  0,    0),

    -- ── Inactive job roles (45) ──
    (org_id, '課長',           NULL, true,  false, 1, 0, 1,    0),
    (org_id, '處長',           NULL, true,  false, 1, 0, 1,    0),
    (org_id, '銷售業務',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '財務長',         NULL, false, false, 1, 0, 1,    0),
    (org_id, '行銷副理',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '資深業務專員',   NULL, false, false, 1, 0, 1,    0),
    (org_id, '營運長',         NULL, false, false, 1, 0, 1,    0),
    (org_id, '研發專案經理',   NULL, false, false, 1, 0, 1,    0),
    (org_id, '總監',           NULL, false, false, 1, 0, 1,    0),
    (org_id, '財務',           NULL, false, false, 1, 0, 1,    0),
    (org_id, '人資',           NULL, false, false, 1, 0, 1,    0),
    (org_id, '高級業務專員',   NULL, false, false, 1, 0, 1,    0),
    (org_id, '內場領班',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '副店長',         NULL, true,  false, 1, 0, 1, 4000),
    (org_id, '外場正職',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '內場儲備幹部',   NULL, false, false, 1, 0, 1,    0),
    (org_id, '儲備幹部',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '內場正職',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '外場計時',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '內場計時',       NULL, false, false, 3, 0, 3,    0),
    (org_id, '稽核',           NULL, false, false, 1, 0, 1,    0),
    (org_id, '行政助理',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '研發經理',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '特助',           NULL, true,  false, 0, 0, 0,    0),
    (org_id, '副總',           NULL, true,  false, 1, 0, 1,    0),
    (org_id, '財務主管',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '供應流通主任',   NULL, true,  false, 1, 0, 1,    0),
    (org_id, '門市業務',       NULL, false, false, 0, 0, 0,    0),
    (org_id, '業務經理',       NULL, false, false, 0, 0, 0,    0),
    (org_id, '設計助理',       NULL, false, false, 0, 0, 0,    0),
    (org_id, '品牌顧問',       NULL, false, false, 0, 0, 0,    0),
    (org_id, '文案企劃',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '董事長助理',     NULL, false, false, 1, 0, 1,    0),
    (org_id, '線上客服',       NULL, false, false, 3, 0, 3,    0),
    (org_id, '行銷企劃',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '經營副總',       NULL, true,  false, 1, 0, 1,    0),
    (org_id, '助理',           NULL, false, false, 1, 0, 1,    0),
    (org_id, '主理人',         NULL, false, false, 4, 0, 4,    0),
    (org_id, '整合行銷經理',   NULL, false, false, 0, 0, 0,    0),
    (org_id, '經營管理',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '營運經理',       NULL, true,  false, 1, 0, 1,    0),
    (org_id, '加盟及展店主管', NULL, false, false, 1, 0, 1,    0),
    (org_id, '績效經理',       NULL, false, false, 1, 0, 1,    0),
    (org_id, '主管',           NULL, true,  false, 1, 0, 1,    0),
    (org_id, '主廚',           NULL, false, false, 0, 0, 0,    0),
    (org_id, '教育訓練',       NULL, false, false, 0, 0, 0,    0)
  ON CONFLICT (organization_id, title) DO NOTHING;
END $$;
