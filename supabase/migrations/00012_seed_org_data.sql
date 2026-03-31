-- ============================================================
-- SEED: Organization Data — Departments, Stores, Employees,
--   Manager Assignments, Manager History
-- Source: seed_employee_department_store_data (PART 2)
-- ============================================================

DO $$
DECLARE
  org_id    UUID;
  dept_ops  UUID;   -- 營運部
  dept_mia  UUID;   -- mia門店 (department)
BEGIN
  -- Get organization
  SELECT id INTO org_id FROM public.organizations LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Create an organization first.';
  END IF;

  -- ──────────────────────────────────────────────
  -- 1. Seed Departments (13 departments)
  -- ──────────────────────────────────────────────
  INSERT INTO public.departments (organization_id, name, level) VALUES
    (org_id, '總經理室',       '董事長'),
    (org_id, '營運部',         '部'),
    (org_id, '人資部',         '部'),
    (org_id, '品牌行銷部',     '部'),
    (org_id, '業務部',         '部'),
    (org_id, '管理部',         '部'),
    (org_id, '加盟展店事業部', '部'),
    (org_id, '採購部',         '部'),
    (org_id, '產品及通路開發部','部'),
    (org_id, '經營管理部',     '部'),
    (org_id, '線上部門',       '部'),
    (org_id, '倉儲物流部',     '部'),
    (org_id, 'mia門店',        '部');

  -- Set hierarchy: all 部-level under 總經理室
  UPDATE public.departments
  SET parent_department_id = (
    SELECT id FROM public.departments
    WHERE name = '總經理室' AND organization_id = org_id
    LIMIT 1
  )
  WHERE organization_id = org_id AND level = '部';

  -- Save department IDs for later use
  SELECT id INTO dept_ops FROM public.departments
    WHERE name = '營運部' AND organization_id = org_id LIMIT 1;
  SELECT id INTO dept_mia FROM public.departments
    WHERE name = 'mia門店' AND organization_id = org_id LIMIT 1;

  -- ──────────────────────────────────────────────
  -- 2. Seed Stores (12 retail stores)
  -- ──────────────────────────────────────────────
  INSERT INTO public.stores (organization_id, name, store_code, store_type, is_active, department_id) VALUES
    (org_id, '01中山國小門市', '01', 'retail', true, dept_ops),
    (org_id, '02台中英才門市', '02', 'retail', true, dept_ops),
    (org_id, '03台北永春門市', '03', 'retail', true, dept_ops),
    (org_id, '04微風百貨門市', '04', 'retail', true, dept_ops),
    (org_id, '05天母百貨門市', '05', 'retail', true, dept_ops),
    (org_id, '06中信南港門市', '06', 'retail', true, dept_ops),
    (org_id, '07南京建國門市', '07', 'retail', true, dept_ops),
    (org_id, '09高雄中正門市', '09', 'retail', true, dept_ops),
    (org_id, '10六張犁門市',   '10', 'retail', true, dept_ops),
    (org_id, '11松江長安門市', '11', 'retail', true, dept_ops),
    (org_id, '12台中文心門市', '12', 'retail', true, dept_ops),
    (org_id, 'mia門店',        'mia','retail', true, dept_mia);

  -- ──────────────────────────────────────────────
  -- 3. Seed Employees (85 employees)
  -- ──────────────────────────────────────────────
  CREATE TEMP TABLE _emp_seed (
    emp_no       TEXT PRIMARY KEY,
    emp_name     TEXT NOT NULL,
    dept_or_store TEXT NOT NULL,
    position     TEXT NOT NULL,
    email        TEXT
  ) ON COMMIT DROP;

  INSERT INTO _emp_seed (emp_no, emp_name, dept_or_store, position, email) VALUES
    -- ── Department employees (19) ──
    ('L2021000', '曠虎',   '總經理室',       '創辦人(老闆)', NULL),
    ('L2021024', '陳虹',   '總經理室',       '執行長',       NULL),
    ('L2021044', '張庭瑋', '營運部',         '督導',         NULL),
    ('L2021051', '李英穎', '倉儲物流部',     '主任',         'allen830413@gmail.com'),
    ('L2021064', '黃瑀珊', '營運部',         '督導',         'coco78951300@gmail.com'),
    ('L2021100', '楊學文', '管理部',         '專員',         'xw@wineswee.com'),
    ('L2021108', '張開翔', '品牌行銷部',     '視覺設計',     'ken@wineswee.com'),
    ('L2021109', '陳佩璇', '管理部',         '專員',         'alicia@wineswee.com'),
    ('L2021110', '徐其祥', '品牌行銷部',     '企劃經理',     NULL),
    ('L2025024', '楊家謙', '倉儲物流部',     '專員',         NULL),
    ('L2025026', '詹健如', '管理部',         '採購',         'anita@wineswee.com'),
    ('L2025027', '林冀',   '品牌行銷部',     '視覺設計',     'sunny@wineswee.com'),
    ('L2025043', '朱紹蓉', '倉儲物流部',     '火腿師傅',     NULL),
    ('L2025072', '游以欣', '業務部',         '主任',         'rebacca741216@hotmail.com'),
    ('L2026093', '黃品穎', '品牌行銷部',     '行銷',         NULL),
    ('L2026099', '劉雅玲', '管理部',         '稽核人員',     NULL),
    ('L2026110', '張啟達', '人資部',         '經理',         NULL),
    ('L2026111', '林巧玉', '加盟展店事業部', '經理',         'yu0909492076@gmail.com'),
    ('L2026112', '尤敬皓', '人資部',         '主任',         NULL),

    -- ── Store employees (66) ──
    -- 01中山國小門市
    ('L2021076', '劉家君',   '01中山國小門市', '店長',         'kmagic617@hotmail.com'),
    ('L2025003', '莊浩隆',   '01中山國小門市', '門市兼職人員', NULL),
    ('L2025015', '王澤昇',   '01中山國小門市', '門市兼職人員', NULL),
    ('L2025018', '張丞佑',   '01中山國小門市', '門市正職人員', NULL),
    ('L2025025', '黃為煇',   '01中山國小門市', '門市兼職人員', NULL),
    ('L2025060', '許辰',     '01中山國小門市', '門市兼職人員', NULL),
    ('L2025064', '林則宇',   '01中山國小門市', '門市兼職人員', NULL),
    ('P20260026','謝駿伊',   '01中山國小門市', '門市兼職人員', NULL),

    -- 02台中英才門市
    ('L2021098', '馮千瑜',   '02台中英才門市', '門市正職人員', NULL),
    ('L2021099', '楊朝鈞',   '02台中英才門市', '門市正職人員', NULL),
    ('L2021101', '潘琦',     '02台中英才門市', '門市兼職人員', 'panchi0908167010@gmail.com'),
    ('L2025051', '林善智',   '02台中英才門市', '門市兼職人員', NULL),
    ('P20260027','柯雨晶',   '02台中英才門市', '門市兼職人員', NULL),

    -- 03台北永春門市
    ('L2021080', '陳嘉益',   '03台北永春門市', '店長',         'for129card118@gmail.com'),
    ('L2025001', '許亦翎',   '03台北永春門市', '門市正職人員', 'YaYa19991113@gmail.com'),
    ('L2025053', '張愷惠',   '03台北永春門市', '門市兼職人員', NULL),
    ('L2025063', '徐宥芯',   '03台北永春門市', '門市正職人員', NULL),
    ('P20260013','洪瑛玟',   '03台北永春門市', '門市兼職人員', NULL),
    ('P20260024','蔡伊真',   '03台北永春門市', '門市兼職人員', NULL),

    -- 04微風百貨門市
    ('L2021084', '高承揚',   '04微風百貨門市', '店長',         'waterkao770108@gmail.com'),
    ('L2025005', '林孟豪',   '04微風百貨門市', '門市兼職人員', NULL),
    ('L2025013', '沈怡臻',   '04微風百貨門市', '門市正職人員', NULL),
    ('L2025075', '吳承祐',   '04微風百貨門市', '門市正職人員', NULL),
    ('P2025002', '李欣霈',   '04微風百貨門市', '門市兼職人員', NULL),
    ('P2025014', '康維珊',   '04微風百貨門市', '門市兼職人員', NULL),
    ('P20260025','林翊賢',   '04微風百貨門市', '門市兼職人員', NULL),

    -- 05天母百貨門市
    ('L2021107', '張家瑀',   '05天母百貨門市', '門市兼職人員', NULL),
    ('L2021113', '潘風傑',   '05天母百貨門市', '門市正職人員', NULL),
    ('L2025022', '曲相澄',   '05天母百貨門市', '門市兼職人員', NULL),
    ('L2025052', '李建廷',   '05天母百貨門市', '門市兼職人員', NULL),
    ('L2026104', '戴羿弘',   '05天母百貨門市', '門市正職人員', NULL),
    ('P20260009','李志榮',   '05天母百貨門市', '門市兼職人員', NULL),

    -- 06中信南港門市
    ('L2021089', '鐘蕎',     '06中信南港門市', '店長',         'zxcv000258@gmail.com'),
    ('L2025034', '黃瑋晴',   '06中信南港門市', '門市兼職人員', NULL),
    ('L2025040', '陳芮葒',   '06中信南港門市', '門市正職人員', NULL),
    ('L2025047', '王筠晨',   '06中信南港門市', '門市正職人員', NULL),
    ('P20260018','王萱之',   '06中信南港門市', '門市兼職人員', NULL),
    ('P20260028','邱翊瑄',   '06中信南港門市', '門市兼職人員', NULL),

    -- 07南京建國門市
    ('L2025035', '周佳霖',   '07南京建國門市', '店長',         NULL),
    ('L2025054', '阮玉安',   '07南京建國門市', '門市兼職人員', NULL),
    ('L2026107', '詹佑理',   '07南京建國門市', '門市正職人員', NULL),
    ('L2026108', '王竣禾',   '07南京建國門市', '門市正職人員', NULL),
    ('L2026109', '施佑廷',   '07南京建國門市', '門市正職人員', NULL),
    ('P20260010','朱蕙瑾',   '07南京建國門市', '門市兼職人員', NULL),

    -- 09高雄中正門市
    ('L2025057', '溫子杰',   '09高雄中正門市', '門市兼職人員', NULL),
    ('L2025059', '許筠瑄',   '09高雄中正門市', '門市兼職人員', NULL),
    ('L2025068', '張耀',     '09高雄中正門市', '門市正職人員', NULL),
    ('L2025071', '陳涵妮',   '09高雄中正門市', '門市兼職人員', NULL),
    ('L2025073', '陳雲瑄',   '09高雄中正門市', '門市兼職人員', NULL),
    ('L2026106', '林家民',   '09高雄中正門市', '門市正職人員', NULL),
    ('P20260011','江建賦',   '09高雄中正門市', '門市兼職人員', NULL),

    -- 10六張犁門市
    ('L2025078', '劉萱',     '10六張犁門市',   '門市兼職人員', NULL),
    ('L2025079', '郭正如',   '10六張犁門市',   '門市正職人員', NULL),
    ('L2026087', '詹程翰',   '10六張犁門市',   '門市正職人員', NULL),

    -- 11松江長安門市
    ('L2025083', '陳羽庭',   '11松江長安門市', '門市兼職人員', NULL),
    ('L2026092', '呂怡毅',   '11松江長安門市', '門市正職人員', NULL),
    ('L2026097', '蕭佑庭',   '11松江長安門市', '門市正職人員', 'wjo3cp32j03@gmail.com'),
    ('P20260005','王莉程',   '11松江長安門市', '門市兼職人員', NULL),
    ('P20260012','孫嘉澤',   '11松江長安門市', '門市正職人員', NULL),

    -- 12台中文心門市
    ('L2021070', '趙亨威',   '12台中文心門市', '區督導',       'qptyx7496@gmail.com'),
    ('L2026088', '張惠萍',   '12台中文心門市', '門市正職人員', 'amid.panay98116107@gmail.com'),
    ('L2026100', '廖昱呈',   '12台中文心門市', '門市正職人員', NULL),
    ('L2026101', '張家禎',   '12台中文心門市', '門市正職人員', NULL),
    ('L2026102', '徐宛利',   '12台中文心門市', '門市正職人員', NULL),
    ('P20260021','何芯芸',   '12台中文心門市', '門市兼職人員', NULL),

    -- mia門店
    ('L2021112', '蘇東俞',   'mia門店',        '門市正職人員', NULL);

  -- Insert employees from staging table
  INSERT INTO public.users (
    organization_id, name, email, employee_number, position,
    employee_type, department_id, store_id,
    hire_date, status, is_manager, created_at, updated_at
  )
  SELECT
    org_id,
    e.emp_name,
    e.email,
    e.emp_no,
    e.position,
    CASE WHEN e.position LIKE '%兼職%' THEN 'part_time' ELSE 'full_time' END,
    d.id,
    s.id,
    CASE
      WHEN e.emp_no ~ '^[LP]2021'  THEN '2021-01-01'::DATE
      WHEN e.emp_no ~ '^[LP]2025'  THEN '2025-01-01'::DATE
      WHEN e.emp_no ~ '^[LP]2026'  THEN '2026-01-01'::DATE
      WHEN e.emp_no ~ '^P2026'     THEN '2026-01-01'::DATE
      ELSE '2025-01-01'::DATE
    END,
    'active',
    e.position IN ('創辦人(老闆)','執行長','督導','區督導','店長','主任','經理','企劃經理'),
    NOW(), NOW()
  FROM _emp_seed e
  LEFT JOIN public.departments d
    ON d.name = e.dept_or_store AND d.organization_id = org_id
  LEFT JOIN public.stores s
    ON s.name = e.dept_or_store AND s.organization_id = org_id;

  -- ──────────────────────────────────────────────
  -- 4. Link store employees via user_stores
  -- ──────────────────────────────────────────────
  INSERT INTO public.user_stores (user_id, store_id, is_primary, created_at)
  SELECT u.id, u.store_id, true, NOW()
  FROM public.users u
  WHERE u.organization_id = org_id
    AND u.store_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_stores us
      WHERE us.user_id = u.id AND us.store_id = u.store_id
    );

  -- ──────────────────────────────────────────────
  -- 5. Set current department managers
  -- ──────────────────────────────────────────────

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2025-09-19'
  WHERE name = '總經理室' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2025-11-11'
  WHERE name = '營運部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2026110' LIMIT 1),
    manager_effective_date = '2026-03-10'
  WHERE name = '人資部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2022-02-01'
  WHERE name = '品牌行銷部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2022-08-01'
  WHERE name = '業務部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2024-08-16'
  WHERE name = '管理部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2026111' LIMIT 1),
    manager_effective_date = '2026-03-23'
  WHERE name = '加盟展店事業部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2024-11-15'
  WHERE name = '採購部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2023-09-17'
  WHERE name = '產品及通路開發部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2025-11-25'
  WHERE name = '經營管理部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2023-09-28'
  WHERE name = '線上部門' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021051' LIMIT 1),
    manager_effective_date = '2025-09-01'
  WHERE name = '倉儲物流部' AND organization_id = org_id;

  UPDATE public.departments SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2025-10-01'
  WHERE name = 'mia門店' AND organization_id = org_id;

  -- ──────────────────────────────────────────────
  -- 6. Set current store managers
  -- ──────────────────────────────────────────────

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021076' LIMIT 1),
    manager_effective_date = '2025-05-01'
  WHERE store_code = '01' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021044' LIMIT 1),
    manager_effective_date = '2026-03-16'
  WHERE store_code = '02' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021080' LIMIT 1),
    manager_effective_date = '2025-05-01'
  WHERE store_code = '03' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021084' LIMIT 1),
    manager_effective_date = '2025-08-01'
  WHERE store_code = '04' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021080' LIMIT 1),
    manager_effective_date = '2026-03-25'
  WHERE store_code = '05' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021089' LIMIT 1),
    manager_effective_date = '2025-05-29'
  WHERE store_code = '06' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2025035' LIMIT 1),
    manager_effective_date = '2025-09-01'
  WHERE store_code = '07' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021044' LIMIT 1),
    manager_effective_date = '2026-02-01'
  WHERE store_code = '09' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021064' LIMIT 1),
    manager_effective_date = '2025-12-11'
  WHERE store_code = '10' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021064' LIMIT 1),
    manager_effective_date = '2026-02-01'
  WHERE store_code = '11' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021044' LIMIT 1),
    manager_effective_date = '2026-02-01'
  WHERE store_code = '12' AND organization_id = org_id;

  UPDATE public.stores SET
    manager_user_id = (SELECT id FROM public.users WHERE employee_number = 'L2021024' LIMIT 1),
    manager_effective_date = '2025-10-01'
  WHERE store_code = 'mia' AND organization_id = org_id;

  -- ──────────────────────────────────────────────
  -- 7. Seed department manager history
  -- ──────────────────────────────────────────────
  INSERT INTO public.department_manager_history
    (organization_id, department_id, store_id, manager_user_id, manager_employee_number, manager_name, effective_date, end_date, notes)

  -- Department manager history (department_id set, store_id NULL)
  SELECT org_id, d.id, NULL,
    u.id, h.mgr_emp_no, h.mgr_name, h.eff_date, h.end_dt, h.notes
  FROM (VALUES
    ('總經理室',       'L2021024', '陳虹', '2025-09-19'::DATE, NULL::DATE, NULL::TEXT),
    ('營運部',         'L2021024', '陳虹', '2025-11-11', NULL, NULL),
    ('營運部',         'L2025036', '鍾倩文','2025-10-31','2025-11-10', NULL),
    ('營運部',         'L2025029', '柯俊宏','2025-09-03','2025-10-30', NULL),
    ('營運部',         'L2021024', '陳虹', '2022-07-26','2025-09-02', NULL),
    ('人資部',         'L2026110', '張啟達','2026-03-10', NULL, NULL),
    ('人資部',         'L2021024', '陳虹', '2022-02-01','2026-03-09', NULL),
    ('人資部',         'L2021015', '陳春月','2021-11-22','2022-01-31', NULL),
    ('人資部',         'L2021022', 'OPPA', '2021-09-06','2021-11-21', NULL),
    ('品牌行銷部',     'L2021024', '陳虹', '2022-02-01', NULL, NULL),
    ('品牌行銷部',     'L2021015', '陳春月','2021-11-22','2022-01-31', NULL),
    ('品牌行銷部',     'L2021022', 'OPPA', '2021-11-08','2021-11-21', NULL),
    ('品牌行銷部',     'L2021026', '藍敬尹','2021-10-18','2021-11-07', NULL),
    ('品牌行銷部',     'L2021018', '吳佩儀','2021-10-01','2021-10-17', NULL),
    ('品牌行銷部',     'L2021015', '陳春月','2021-08-19','2022-01-31', NULL),
    ('品牌行銷部',     'L2021012', '龐慎攸','2021-03-26','2021-08-18', NULL),
    ('業務部',         'L2021024', '陳虹', '2022-08-01', NULL, NULL),
    ('管理部',         'L2021024', '陳虹', '2024-08-16', NULL, NULL),
    ('加盟展店事業部', 'L2026111', '林巧玉','2026-03-23', NULL, NULL),
    ('加盟展店事業部', 'L2021024', '陳虹', '2025-10-01','2026-03-22', NULL),
    ('採購部',         'L2021024', '陳虹', '2024-11-15', NULL, NULL),
    ('產品及通路開發部','L2021024', '陳虹', '2023-09-17', NULL, NULL),
    ('經營管理部',     'L2021024', '陳虹', '2025-11-25', NULL, NULL),
    ('線上部門',       'L2021024', '陳虹', '2023-09-28', NULL, NULL),
    ('倉儲物流部',     'L2021051', '李英穎','2025-09-01', NULL, NULL),
    ('倉儲物流部',     'L2021024', '陳虹', '2022-06-17','2025-08-31', NULL),
    ('mia門店',        'L2021024', '陳虹', '2025-10-01', NULL, NULL),
    ('mia門店',        'L2025016', '翁任平','2025-09-01','2025-09-30', NULL),
    ('mia門店',        'L2025113', '張碧純','2025-07-24','2025-08-31', NULL)
  ) AS h(dept_name, mgr_emp_no, mgr_name, eff_date, end_dt, notes)
  JOIN public.departments d ON d.name = h.dept_name AND d.organization_id = org_id
  LEFT JOIN public.users u ON u.employee_number = h.mgr_emp_no

  UNION ALL

  -- Store manager history (department_id NULL, store_id set)
  SELECT org_id, NULL, s.id,
    u.id, h.mgr_emp_no, h.mgr_name, h.eff_date, h.end_dt, h.notes
  FROM (VALUES
    ('01', 'L2021076', '劉家君', '2025-05-01'::DATE, NULL::DATE, NULL::TEXT),
    ('01', 'L2021024', '陳虹',   '2023-10-30','2025-04-30', NULL),
    ('02', 'L2021044', '張庭瑋', '2026-03-16', NULL, NULL),
    ('02', 'L2021070', '趙亨威', '2025-05-01','2026-03-15', NULL),
    ('02', 'L2021024', '陳虹',   '2023-10-30','2025-04-30', NULL),
    ('03', 'L2021080', '陳嘉益', '2025-05-01', NULL, NULL),
    ('03', 'L2021024', '陳虹',   '2024-02-01','2025-04-30', NULL),
    ('04', 'L2021084', '高承揚', '2025-08-01', NULL, NULL),
    ('04', 'L2021044', '張庭瑋', '2025-05-01','2025-07-31', NULL),
    ('04', 'L2021024', '陳虹',   '2024-11-18','2025-04-30', NULL),
    ('05', 'L2021080', '陳嘉益', '2026-03-25', NULL, '奉執行長指示兼任天母店店長'),
    ('05', 'L2021064', '黃瑀珊', '2025-05-01','2026-03-24', NULL),
    ('05', 'L2021024', '陳虹',   '2025-04-10','2025-04-30', NULL),
    ('06', 'L2021089', '鐘蕎',   '2025-05-29', NULL, NULL),
    ('07', 'L2025035', '周佳霖', '2025-09-01', NULL, NULL),
    ('07', 'L2021044', '張庭瑋', '2025-06-01','2025-08-31', NULL),
    ('09', 'L2021044', '張庭瑋', '2026-02-01', NULL, NULL),
    ('09', 'L2021064', '黃瑀珊', '2025-11-11','2026-01-31', NULL),
    ('10', 'L2021064', '黃瑀珊', '2025-12-11', NULL, NULL),
    ('11', 'L2021064', '黃瑀珊', '2026-02-01', NULL, NULL),
    ('11', 'L2021044', '張庭瑋', '2025-11-15','2026-01-31', NULL),
    ('12', 'L2021044', '張庭瑋', '2026-02-01', NULL, NULL),
    ('12', 'L2021070', '趙亨威', '2026-01-01','2026-01-31', NULL)
  ) AS h(store_code, mgr_emp_no, mgr_name, eff_date, end_dt, notes)
  JOIN public.stores s ON s.store_code = h.store_code AND s.organization_id = org_id
  LEFT JOIN public.users u ON u.employee_number = h.mgr_emp_no;

  -- Cleanup
  DROP TABLE IF EXISTS _emp_seed;
END $$;
