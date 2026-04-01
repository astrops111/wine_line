-- 00016: ERP Expansion — vendors, inventory, workflow templates, break tracking

BEGIN;

-- ── Break Tracking (add start/end timestamps to time_records) ──────────────
ALTER TABLE IF EXISTS public.time_records
  ADD COLUMN IF NOT EXISTS break_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_end TIMESTAMPTZ;

-- ── Vendors ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  category TEXT,
  payment_terms TEXT,
  tax_id TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vendors_org ON public.vendors(organization_id);

-- ── Purchase Orders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  po_number TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','received','cancelled')),
  ordered_by UUID REFERENCES public.users(id),
  expected_date DATE,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_po_org ON public.purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON public.purchase_orders(vendor_id);

-- ── Inventory Items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  store_id UUID REFERENCES public.stores(id),
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  unit TEXT DEFAULT '個',
  quantity NUMERIC(12,2) DEFAULT 0,
  min_quantity NUMERIC(12,2) DEFAULT 0,
  cost_price NUMERIC(12,2),
  vendor_id UUID REFERENCES public.vendors(id),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_items_org ON public.inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_store ON public.inventory_items(store_id);

-- ── Inventory Transactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in','out','adjust','count')),
  quantity NUMERIC(12,2) NOT NULL,
  reference TEXT,
  performed_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_txn_org ON public.inventory_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_item ON public.inventory_transactions(item_id);

-- ── Stocktakes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  store_id UUID REFERENCES public.stores(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed')),
  started_by UUID REFERENCES public.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stocktake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES public.stocktakes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  expected_quantity NUMERIC(12,2),
  counted_quantity NUMERIC(12,2),
  variance NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stocktake_items ENABLE ROW LEVEL SECURITY;

-- ── Workflow Template Library ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_template_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  description_en TEXT,
  category TEXT,
  icon TEXT DEFAULT '📋',
  steps JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.workflow_template_library ENABLE ROW LEVEL SECURITY;

-- ── Seed Template Library ──────────────────────────────────────────────────
INSERT INTO public.workflow_template_library (name, name_en, description, description_en, category, icon, steps) VALUES
('新店開店準備', 'Store Opening', '新店開幕前所有準備事項的完整流程', 'Complete checklist for new store opening preparations', '營運', '🏪', '[
  {"name":"設計圖確認","owner":"設計部"},
  {"name":"工程報價","owner":"工程部"},
  {"name":"施工圖面確認及工程發包","owner":"工程部"},
  {"name":"電力申請","owner":"工程部"},
  {"name":"設備採購","owner":"採購部"},
  {"name":"家具採購","owner":"設計部"},
  {"name":"招牌安裝","owner":"工程部"},
  {"name":"電話及網路申請","owner":"工程部"},
  {"name":"監視器/音響安裝","owner":"工程部"},
  {"name":"統編及稅籍申請","owner":"行政部"},
  {"name":"POS/刷卡機準備","owner":"行政部"},
  {"name":"人力編制到位","owner":"營運部"},
  {"name":"人力訓練安排","owner":"營運部"},
  {"name":"行銷廣告確認及發布","owner":"行銷部"},
  {"name":"確認開幕時間","owner":"管理部"}
]'::jsonb),
('員工入職流程', 'Employee Onboarding', '新進員工入職所需文件、系統設定及訓練排程', 'New hire document collection, system setup and training schedule', '人資', '👋', '[
  {"name":"基本資料收集","owner":"人資部"},
  {"name":"勞健保加保","owner":"人資部"},
  {"name":"銀行帳戶設定","owner":"人資部"},
  {"name":"帳號開通(POS/系統)","owner":"IT"},
  {"name":"制服/識別證","owner":"人資部"},
  {"name":"環境介紹","owner":"門市主管"},
  {"name":"基礎訓練","owner":"門市主管"},
  {"name":"試用期目標設定","owner":"直屬主管"}
]'::jsonb),
('月度盤點', 'Monthly Stocktake', '月底庫存盤點標準作業程序', 'End-of-month inventory count SOP', '營運', '📦', '[
  {"name":"列印盤點表","owner":"門市主管"},
  {"name":"清點倉庫存貨","owner":"值班人員"},
  {"name":"清點陳列區","owner":"值班人員"},
  {"name":"記錄差異數量","owner":"值班人員"},
  {"name":"主管複核","owner":"門市主管"},
  {"name":"輸入系統","owner":"門市主管"},
  {"name":"差異報告","owner":"營運部"}
]'::jsonb),
('日常開店作業', 'Daily Store Opening', '每日開店前標準檢查清單', 'Daily pre-opening standard checklist', '營運', '🌅', '[
  {"name":"開啟空調/燈光","owner":"開店人員"},
  {"name":"收銀機開機/備零錢","owner":"開店人員"},
  {"name":"環境清潔檢查","owner":"開店人員"},
  {"name":"商品陳列整理","owner":"開店人員"},
  {"name":"食材備料/效期確認","owner":"開店人員"},
  {"name":"設備運作檢查","owner":"開店人員"},
  {"name":"開店前會議","owner":"門市主管"}
]'::jsonb),
('日常關店作業', 'Daily Store Closing', '每日關店標準作業程序', 'Daily closing standard checklist', '營運', '🌙', '[
  {"name":"最後客人離場確認","owner":"關店人員"},
  {"name":"營業額結算","owner":"關店人員"},
  {"name":"收銀機結帳/繳款","owner":"關店人員"},
  {"name":"食材收存/標示效期","owner":"關店人員"},
  {"name":"環境清潔","owner":"關店人員"},
  {"name":"設備關閉","owner":"關店人員"},
  {"name":"保全設定/鎖門","owner":"關店人員"}
]'::jsonb),
('設備維護排程', 'Equipment Maintenance', '定期設備保養維護工作清單', 'Periodic equipment maintenance checklist', '營運', '🔧', '[
  {"name":"冷藏/冷凍設備溫度校正","owner":"工程部"},
  {"name":"咖啡機保養","owner":"門市人員"},
  {"name":"製冰機清潔","owner":"門市人員"},
  {"name":"抽油煙機清洗","owner":"清潔廠商"},
  {"name":"空調濾網清潔","owner":"工程部"},
  {"name":"消防設備檢查","owner":"工程部"},
  {"name":"水電管路檢查","owner":"工程部"}
]'::jsonb);

COMMIT;
