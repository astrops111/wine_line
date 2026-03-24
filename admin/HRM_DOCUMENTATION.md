# HRM System — Feature & Process Documentation

> **System**: AI LINE Bot Operations System — Human Resource Management Module
> **Stack**: React + TypeScript (Vite) · Supabase (PostgreSQL + Edge Functions + RLS) · LINE LIFF · LINE Messaging API
> **Compliance**: Taiwan Labor Standards Act (勞動基準法)
> **Last Updated**: 2026-03-24

---

## Table of Contents

0. [Enterprise HRM Architecture (Full Vision)](#0-enterprise-hrm-architecture-full-vision)
1. [System Architecture (Technical)](#1-system-architecture-technical)
2. [Phase 1 — Attendance & Leave Forms](#2-phase-1--attendance--leave-forms)
3. [Phase 2 — Scheduling & Labor Law Compliance](#3-phase-2--scheduling--labor-law-compliance)
4. [Phase 3 — HR Dashboard & Risk Monitoring](#4-phase-3--hr-dashboard--risk-monitoring)
5. [Phase 4 — Payroll Engine](#5-phase-4--payroll-engine)
6. [Mobile LIFF App (Employee Self-Service)](#6-mobile-liff-app-employee-self-service)
7. [LINE Bot Commands](#7-line-bot-commands)
8. [Database Schema Reference](#8-database-schema-reference)
9. [Edge Functions Reference](#9-edge-functions-reference)
10. [Admin Navigation Map](#10-admin-navigation-map)

---

## 0. Enterprise HRM Architecture (Full Vision)

This section defines the complete enterprise-level HRM system blueprint. Use it to understand scope, prioritize development phases, and identify gaps.

---

### Full System Map

```
HRM SYSTEM
├── Core Foundation
│   ├── Organization Management
│   ├── Role & Permission Management (RBAC)
│   └── Employee Management (lifecycle)
│
├── Workforce Operations
│   ├── Timesheet (clock-in / clock-out)
│   ├── Shift Scheduling
│   └── Leave & Holiday Management
│
├── Payroll & Compliance
│   ├── Payroll Engine
│   ├── Insurance Management (勞保 / 健保 / 勞退)
│   └── Regulatory Compliance (labor law, tax)
│
├── HR Strategic Layer
│   ├── Performance Management
│   └── Recruitment / ATS
│
├── System Infrastructure
│   ├── Workflow & Approval Automation
│   ├── Document Management
│   └── Audit Logs
│
├── Experience Layer
│   ├── Dashboard & Analytics
│   └── Employee Self-Service (ESS)
│
├── Intelligence Layer
│   └── AI (scheduling, insights, LINE chat)
│
└── Integration Layer
    └── ERP / POS / LINE / Accounting
```

---

### Layer 1 — Core Foundation

#### 🧩 Organization Management
| Feature | Description |
|---------|-------------|
| Company → Brand → Entity → Branch/Store hierarchy | Multi-level org tree |
| Department structure | Functional grouping within stores |
| Cost center mapping | Link departments to financial reporting units |
| Legal entity support | Separate legal entities for payroll/tax |
| Multi-location | All above spans across unlimited stores |

#### 🔐 Role & Permission Management (RBAC)
| Feature | Description |
|---------|-------------|
| Role definitions | HR admin / store manager / staff / area manager |
| Data-level permissions | View payroll? Edit attendance? Approve leave? |
| Custom roles | Per-org configurable roles |
| Multi-tenant ready | Org-scoped data isolation for future SaaS |

> **Current status**: Basic role separation implemented. Full RBAC (data-level per role) is in `20260324300000_role_based_rls.sql`.

#### 👤 Employee Management
| Feature | Description |
|---------|-------------|
| Personal info | Name, ID, birth date, gender, nationality |
| Contact & emergency | Address, phone, emergency contact |
| Identity & banking | ID number, bank code/account |
| Insurance enrollment | 勞保 / 健保 / 勞退 with enrollment dates and grades |
| Salary structure | Base, allowances, bonuses, hourly/monthly type |
| Employment lifecycle | Onboarding → probation → transfer → termination |
| Dependents (眷屬) | Spouse, children, parents — NHI dependent tracking |
| Position history (異動紀錄) | Full snapshot per career change — title, salary, dept, store |

---

### Layer 2 — Workforce Operations

#### 🕒 Timesheet Management
| Feature | Status |
|---------|--------|
| LINE LIFF one-tap clock-in/out | ✅ Done |
| GPS location validation | ✅ Done |
| WiFi IP validation | ✅ Done |
| Overtime rules | ✅ Done |
| Punch correction (補登) workflow | ✅ Done |
| Break tracking | 🔲 Not yet built |

#### 📅 Shift Scheduling
| Feature | Status |
|---------|--------|
| Shift templates (A班/B班/etc.) | ✅ Done |
| Weekly/monthly calendar view | ✅ Done |
| Publish with labor law validation | ✅ Done (七休一, 11h rest) |
| Employee availability preferences | ✅ Done |
| AI auto-scheduling | ✅ Done (AI criteria panel) |
| Swap / replacement workflow | 🔲 Not yet built |

#### 🌴 Leave & Holiday Management
| Feature | Status |
|---------|--------|
| Leave types (annual, sick, personal, unpaid) | ✅ Done |
| Taiwan labor law auto-calculation (annual leave) | ✅ Done |
| Approval workflow | ✅ Done |
| Leave balance tracking | ✅ Done |
| Holiday calendar | ✅ Done |

---

### Layer 3 — Payroll & Compliance

#### 💵 Payroll Engine
| Feature | Status |
|---------|--------|
| Salary structure setup (base, allowances, bonuses) | ✅ Done |
| Monthly payroll calculation | ✅ Done |
| OT pay (weekday 4/3x+5/3x, holiday 2x) | ✅ Done |
| Leave deduction | ✅ Done |
| Late-arrival deduction | ✅ Done |
| Year-end bonus (年終獎金) | ✅ Done |
| Ad-hoc bonus (per-period entry) | ✅ Done |
| CSV export for accounting | ✅ Done |
| Payslip generation (LINE Flex Message) | ✅ Done |
| Employee LIFF payslip view | ✅ Done |
| Performance bonus / project bonus | 🔲 Future |

#### 🛡️ Insurance Management
| Feature | Status |
|---------|--------|
| 勞保 (Labor Insurance) bracket calculation | ✅ Done |
| 健保 (Health Insurance) bracket + dependents | ✅ Done |
| 勞退 (Labor Pension) employer 6% contribution | ✅ Done |
| Insurance enrollment tracking per employee | ✅ Done |
| Government submission export | 🔲 Future |

#### ⚖️ Regulatory Compliance
| Feature | Status |
|---------|--------|
| Overtime cap monitoring (46h/month) | ✅ Done |
| 七休一 / 11h rest scheduling validation | ✅ Done |
| Income tax withholding (所得稅扣繳) | ✅ Done |
| 扣繳憑單 (annual withholding certificate) | 🔲 Future |
| Audit logs for payroll changes | 🔲 Future |

---

### Layer 4 — HR Strategic Layer

#### 📊 Performance Management
| Feature | Status |
|---------|--------|
| KPI tracking | 🔲 Future |
| Promotion workflows | 🔲 Future |
| Disciplinary logs | 🔲 Future |
| Training records | 🔲 Future |

#### 🧲 Recruitment / ATS
> **This is where 104 HRM is strong — currently a gap in this system.**

| Feature | Status |
|---------|--------|
| Job posting management | 🔲 Not built |
| Candidate pipeline / tracking | 🔲 Not built |
| Interview scheduling | 🔲 Not built |
| Offer management | 🔲 Not built |

---

### Layer 5 — System Infrastructure

#### 🔁 Workflow & Approval Automation
| Feature | Status |
|---------|--------|
| Approval flows (leave, OT, punch correction) | ✅ Done |
| Event triggers (late clock-in → notify) | ✅ Done |
| AI-powered workflow templates | ✅ Done |
| End-of-month payroll automation | 🔲 Future |

#### 📂 Document Management
| Feature | Status |
|---------|--------|
| Employee contracts | 🔲 Not built |
| ID / permit uploads | 🔲 Not built |
| Payslip archive | 🔲 Partial (sent_at tracked, no PDF archive) |

#### 🧾 Audit Logs
| Feature | Status |
|---------|--------|
| System action logging | 🔲 Not built |
| Payroll change trail | 🔲 Not built |
| Compliance audit report | 🔲 Not built |

---

### Layer 6 — Experience Layer

#### 📈 Dashboard & Analytics
| Feature | Status |
|---------|--------|
| HR Dashboard (hours, risk alerts) | ✅ Done |
| Store Manager Dashboard | ✅ Done |
| Executive / LIFF Manager Dashboard | ✅ Done |
| Labor cost % trend | 🔲 Future |
| Headcount / turnover analytics | 🔲 Future |

#### 📱 Employee Self-Service (ESS via LINE LIFF)
| Feature | Status |
|---------|--------|
| Clock in/out | ✅ Done |
| View schedule | ✅ Done |
| View payslip | ✅ Done |
| Apply for leave | ✅ Done |
| Submit punch correction | ✅ Done |
| HR LINE Bot commands | ✅ Done |

---

### Layer 7 — AI Intelligence Layer

> **This is this system's core competitive edge over traditional HRM software.**

| Feature | Status |
|---------|--------|
| AI auto-scheduling (constraints + preferences) | ✅ Done |
| Natural language HR commands via LINE | ✅ Done (keyword routing) |
| AI workflow creation assistant | ✅ Done |
| AI task assistant | ✅ Done |
| Anomaly detection (absence, OT risk) | ✅ Done (rule-based) |
| Smart HR insights / predictive analytics | 🔲 Future (ML) |
| Conversational LINE-based full HR assistant | 🔲 Future |

---

### Layer 8 — Integration Layer

> **Critical for enterprise adoption — commonly missed in early builds.**

| Integration | Status |
|-------------|--------|
| LINE Bot / LIFF | ✅ Done |
| Supabase / PostgreSQL backend | ✅ Done |
| CSV export (Google Sheets compatible) | ✅ Done |
| 鼎新 / 文中 ERP | 🔲 Future |
| POS (labor cost vs sales ratio) | 🔲 Future |
| Government insurance submission portal | 🔲 Future |
| Accounting system (e.g. QuickBooks, 統一會計) | 🔲 Future |

---

### Gap Analysis — What's Missing vs Enterprise Standard

#### 🔴 Must Add (blocking for enterprise use)
| Gap | Priority |
|-----|----------|
| Recruitment / ATS module | High |
| Audit logs (all HR actions) | High |
| Document management (contracts, ID) | High |
| Integration layer (ERP, accounting) | High |

#### 🟡 High-Value Additions
| Gap | Priority |
|-----|----------|
| Performance management + KPI | Medium |
| Training records / LMS | Medium |
| Expense management | Medium |
| Multi-legal-entity payroll | Medium |
| 扣繳憑單 (annual tax certificate) | Medium |

#### 🟢 Future SaaS Expansion
| Feature | Notes |
|---------|-------|
| Multi-tenant architecture | Org-scoped isolation (partially built in RLS) |
| Billing / subscription module | Per-employee or per-feature pricing |
| API platform | Allow third-party integrations |

---

### Recommended Build Phases

| Phase | Focus | Complexity |
|-------|-------|------------|
| **Phase 1** (Current) | Timesheet, Scheduling, Employee management, Dashboard | ✅ Done |
| **Phase 2** | Full Payroll, Leave automation, Workflow triggers | ✅ Done |
| **Phase 3** | Payroll integration with 鼎新/文中, Audit logs, Document mgmt | 🔲 Next |
| **Phase 4** | Recruitment/ATS, Performance management, Training | 🔲 Future |
| **Phase 5** | AI analytics, Multi-tenant SaaS, API platform | 🔲 Long-term |

---

## 1. System Architecture (Technical)

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Web Panel                         │
│  React + TypeScript · Vite · Tailwind + Custom CSS          │
│  Routes: /hr-dashboard, /time-tracker, /leave-management,   │
│          /overtime-requests, /scheduling, /holidays,        │
│          /shift-rules, /payroll                             │
└────────────────────┬────────────────────────────────────────┘
                     │ Supabase JS Client
┌────────────────────▼────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                       │
│  Tables: time_records, shift_assignments, leave_requests,   │
│          overtime_requests, leave_balances,                 │
│          punch_corrections, salary_structures,              │
│          payroll_runs, payroll_records,                     │
│          labor_ins_brackets, health_ins_brackets            │
│  RLS: enabled on all HR tables                              │
└──────┬──────────────────────────────────────┬───────────────┘
       │ Deno Edge Functions                  │
┌──────▼──────────┐              ┌────────────▼───────────────┐
│  hr-notify      │              │  send-payslips             │
│  line-webhook   │              │  liff-new-task             │
└──────┬──────────┘              └────────────────────────────┘
       │ LINE Messaging API
┌──────▼──────────────────────────────────────────────────────┐
│  Employee LINE App                                           │
│  LIFF: /liff/app  — 6 tabs: 打卡·班表·工時·請假·薪資單·偏好  │
└─────────────────────────────────────────────────────────────┘
```

### Key Shared Libraries

| File | Purpose |
|------|---------|
| `admin/src/lib/supabase.ts` | Supabase client + `FUNCTIONS_URL` export |
| `admin/src/lib/OrgContext.tsx` | `useOrg()` hook — provides `orgId` to all pages |
| `admin/src/lib/i18n.ts` | `getLocale()` / `t()` — bilingual zh-TW / en |
| `admin/src/lib/geo.ts` | `haversineDistance()`, `isWithinRadius()`, `getCurrentPosition()` |

---

## 2. Phase 1 — Attendance & Leave Forms

### 2.1 Mobile Clock-In (`LiffApp.tsx` — 打卡 tab)

Employees clock in/out directly from LINE via the LIFF embedded browser.

#### Clock-In Method Routing

The store's `clock_in_method` setting determines how attendance is validated:

| Method | Behaviour |
|--------|-----------|
| `open` | No restriction — records GPS if available, method logged as `manual` |
| `gps_required` | Must be within `gps_radius_m` of store coordinates. Blocked if out of range. |
| `gps_or_wifi` | GPS first. If outside GPS range, falls back to WiFi IP check. Blocked only if both fail. |
| `wifi` | IP-only check. GPS never requested. Blocked if IP not in `wifi_allowed_ips`. |

#### GPS Validation Process

```
1. Call getCurrentPosition() (browser Geolocation API)
2. Calculate haversineDistance(userLat, userLng, storeLat, storeLng)
3. Compare to store.gps_radius_m (default 200m)
4. If within range → clock in with method='gps'
5. If out of range + gps_or_wifi → proceed to WiFi check
6. If out of range + gps_required → block, show distance + correction form
```

#### WiFi Validation Process

```
1. Fetch public IP via https://api.ipify.org
2. Compare to store.wifi_allowed_ips[] array
3. Match found → clock in with method='wifi'
4. No match → block with "未連接門市 WiFi 網路"
```

#### Clock-In Record (time_records table)

Each successful punch stores:
- `user_id`, `clock_in` / `clock_out` timestamps
- `clock_in_lat`, `clock_in_lng` — device GPS at time of punch
- `clock_in_distance_m` — calculated distance from store
- `clock_in_method` — `gps` / `wifi` / `manual`

#### Punch Correction (補登申請)

When an employee is out of range or forgot to clock in:
1. Employee fills in correction form in the LIFF 工時 tab
2. Request saved to `punch_corrections` with status `pending`
3. Admin reviews in **Time Tracker → Corrections** tab
4. On approve/reject, `hr-notify` edge function sends LINE push notification to employee

---

### 2.2 Leave Management (`LeaveManagement.tsx`)

Route: `/leave-management`

#### Tabs

| Tab | Content |
|-----|---------|
| 待審核 | Pending leave requests with Approve / Reject buttons |
| 所有申請 | Full history with filters (employee, date range, type, status) + New Request button |
| 假額管理 | Leave balance per employee with Taiwan Labor Law auto-calculation |

#### Leave Request Flow

```
Employee submits via LIFF → leave_requests (status: pending)
         ↓
Manager reviews in admin panel → clicks Approve / Reject
         ↓
  On Approve:
    - leave_requests.status = 'approved'
    - leave_balances deducted (upsert with ON CONFLICT)
    - hr-notify → LINE push "請假已核准" (green Flex Message)
  On Reject:
    - leave_requests.status = 'rejected'
    - hr-notify → LINE push "請假未核准" (red Flex Message)
```

#### Taiwan Annual Leave Auto-Calculation (`calcAnnualLeave`)

Based on years of service (年資):

| Years of Service | Annual Leave Days |
|-----------------|-------------------|
| < 6 months | 0 |
| 6 months – 1 year | 3 days |
| 1–2 years | 7 days |
| 2–3 years | 10 days |
| 3–5 years | 14 days |
| 5–10 years | 15 days |
| Each additional year (10+) | +1 day (max 30) |

The **Recalculate** button in the 假額管理 tab re-runs this logic for all employees based on their hire date.

---

### 2.3 Overtime Requests (`OvertimeRequests.tsx`)

Route: `/overtime-requests`

#### Tabs

| Tab | Content |
|-----|---------|
| 待審核 | Pending OT requests — Pre (事前申請) and Post (事後補報) badges |
| 所有紀錄 | All OT records with stats row (total approved hours + count) |
| 超時風險 | Per-employee monthly OT hours grid — color-coded risk |

#### OT Risk Color Coding

| Monthly OT Hours | Color |
|-----------------|-------|
| ≤ 24h | Green — normal |
| 24–46h | Amber — monitor |
| > 46h | Red — legal risk (Taiwan monthly OT cap = 46h) |

#### Overtime Types

- `weekday` — regular weekday overtime
- `holiday` — rest day or national holiday work

These types affect payroll calculation rates (see Phase 4).

---

### 2.4 Time Tracker (`TimeTracker.tsx`)

Route: `/time-tracker`

#### Tabs

| Tab | Content |
|-----|---------|
| 今日 | Real-time clock-in status for all employees today |
| 歷史紀錄 | Time records with date/employee/store filters |
| 線路對應 | LINE user ↔ employee mapping management |
| 補登審核 | Punch correction requests — approve/reject with reason |

---

## 3. Phase 2 — Scheduling & Labor Law Compliance

### 3.1 Scheduling (`Scheduling.tsx`)

Route: `/scheduling`

#### Features

- Monthly/weekly calendar view with drag-and-drop shift assignment
- Multi-shift type support: fixed shifts, split shifts, off days
- Shift templates: A班 (09:00–18:00), B班 (14:00–23:00), etc.
- Publish schedule button with **labor law violation gate**

#### Labor Law Violation Check (排班法規檢核)

Before a schedule can be published, the system checks every assignment in the schedule for:

| Rule | Check | Taiwan Law Reference |
|------|-------|---------------------|
| 七休一 | Any 7-consecutive-day span without a rest day | §36 |
| 最短休息間隔 | Less than 11 hours between end of one shift and start of next | §35 |

**Process:**
```
Manager clicks "Publish"
        ↓
checkLaborLawViolations(assignments) runs
        ↓
Violations found? → Violation modal shown
  - Lists each violation (employee, date, rule, description)
  - "I acknowledge and accept responsibility" checkbox
  - Can only confirm after checking acknowledgement
        ↓
No violations (or acknowledged) → schedule.status = 'published'
```

---

### 3.2 Holidays (`Holidays.tsx`)

Route: `/holidays`

Manage public holidays and store-specific off days. Used by the scheduling system to automatically flag holiday shifts for overtime rate calculation.

---

### 3.3 Shift Rules (`ShiftRules.tsx`)

Route: `/shift-rules`

Reference display of Taiwan Labor Standards Act rules with:
- Maximum working hours per day/week
- Overtime caps (monthly 46h, annual 540h)
- Rest interval requirements
- Holiday and special holiday entitlements

---

### 3.4 Store GPS Configuration (`OrgManagement.tsx` → Locations tab)

Each store has configurable anti-fraud settings:

| Field | Description |
|-------|-------------|
| `gps_lat` / `gps_lng` | Store GPS coordinates |
| `gps_radius_m` | Allowed clock-in radius in meters (default 200m) |
| `clock_in_method` | `open` / `gps_required` / `gps_or_wifi` / `wifi` |
| `wifi_allowed_ips` | Array of store router public IPs for WiFi validation |

---

## 4. Phase 3 — HR Dashboard & Risk Monitoring

### 4.1 HR Dashboard (`HrDashboard.tsx`)

Route: `/hr-dashboard`

#### Tabs

| Tab | Content |
|-----|---------|
| 工時報表 | Hours report — per employee total hours, late count, expected vs actual |
| 匯出 CSV | UTF-8 BOM CSV export with quick month selector |
| 風險警示 | 4 risk cards (see below) |

#### Risk Alert Cards

**1. 超時風險 (High Hours)**
- Triggers: actual hours > 120% of expected hours for the period
- Red: > 150% | Amber: 120–150%

**2. 遲到率 (Late Arrival Rate)**
- Triggers: late count > 20% of total shifts
- Red: > 30% | Amber: 20–30%

**3. 工時不足 (Undertime)**
- Triggers: actual hours < 70% of expected hours

**4. 曠職風險 (Absence Risk)**
- Detects employees with scheduled shifts but no clock-in record
- Only flags shifts on dates **before today** (today's shifts are "pending")
- Query: shift_assignments (non-off-day) LEFT JOIN time_records, find gaps

---

### 4.2 Dashboard HR KPI Cards (`Dashboard.tsx`)

The main `/` dashboard shows 3 quick-action HR cards:

| Card | Data Source | Color |
|------|------------|-------|
| 待審請假 | `leave_requests` count where status='pending' | Orange |
| 待審加班 | `overtime_requests` count where status='pending' | Orange |
| 待審補登 | `punch_corrections` count where status='pending' | Red |

Clicking each card navigates to the corresponding management page.

---

## 5. Phase 4 — Payroll Engine

### 5.1 Payroll Management (`PayrollManagement.tsx`)

Route: `/payroll`

#### Tabs

| Tab | Content |
|-----|---------|
| 薪資結構 | Per-employee salary component configuration |
| 執行薪資 | Monthly payroll calculation + confirm + send |
| 薪資記錄 | Payroll history with drill-down to individual records |
| 保費對照表 | Taiwan 2024 labor/health insurance bracket reference |

---

### 5.2 Salary Structure Setup

Each employee can have one active `salary_structures` record:

| Field | Description |
|-------|-------------|
| `base_salary` | 本薪 — monthly base pay |
| `role_allowance` | 職務加給 |
| `meal_allowance` | 伙食津貼 |
| `transport_allowance` | 交通津貼 |
| `attendance_bonus` | 全勤獎金 — awarded only if zero unpaid leave days |
| `year_end_bonus_months` | 年終月數 — multiplier: `1.5` = 1.5× base salary as year-end bonus |
| `salary_type` | `monthly` or `hourly` |
| `hourly_rate` | Used if salary_type = 'hourly' |
| `health_ins_dependents` | Number of NHI dependents (affects health insurance premium) |

---

### 5.3 Payroll Calculation Engine

The `calculatePayroll()` function computes each employee's monthly pay:

#### Step 1 — Hours Worked
```
SUM(clock_out - clock_in) from time_records WHERE clock_in BETWEEN month_start AND month_end
```

#### Step 2 — Base Pay
```
monthly: base_salary (fixed)
hourly:  hourly_rate × hours_worked
```

#### Step 3 — Overtime Pay
```
Hourly rate = base_salary ÷ 240

Weekday OT:
  First 2 hours:  OT_hours × hourly_rate × 4/3  (133%)
  Beyond 2 hours: remaining × hourly_rate × 5/3  (167%)

Holiday OT:
  All hours × hourly_rate × 2  (200%)

OT data source: overtime_requests WHERE status='approved' AND ot_date IN month
```

#### Step 4 — Attendance Bonus
```
IF leave_days_deducted = 0 THEN attendance_bonus_earned = attendance_bonus
ELSE attendance_bonus_earned = 0
```

#### Step 5 — Year-End Bonus (optional)
```
Toggle "包含年終獎金" ON in the Run Payroll tab to include:
year_end_bonus = year_end_bonus_months × base_salary
```

#### Step 6 — Gross Salary
```
gross = base + role_allowance + meal_allowance + transport_allowance
      + attendance_bonus_earned + overtime_pay + year_end_bonus + other_bonus
```

`other_bonus` is manually entered per-employee in the payroll preview table for ad-hoc additions.

#### Step 7 — Leave Deduction
```
Deductible leave types: 事假 (personal), unpaid, 留職停薪
leave_deduction = (base_salary ÷ 30) × leave_days_deducted
```

#### Step 8 — Late-Arrival Deduction
```
Data source: compare time_records.clock_in vs shift_assignments scheduled start time
Grace period: 5 minutes
late_deduction = (base_salary ÷ 30 ÷ 8 ÷ 60) × late_minutes_total
Only applies to monthly salaried employees
```

#### Step 9 — Labor Insurance (勞保)
```
Find bracket: highest grade where gross >= min_salary
employee_premium = bracket.employee_premium  (pre-calculated: insured_salary × 2.4%)
employer_premium = bracket.employer_premium  (pre-calculated: insured_salary × 8.4%)
```

#### Step 10 — Health Insurance (健保)
```
Find bracket: same logic as labor insurance
employee_premium = bracket.employee_premium × (1 + health_ins_dependents)
employer_premium = bracket.employer_premium
(employee_premium pre-calculated: insured_salary × 1.551% per unit)
```

#### Step 11 — Labor Pension (勞退)
```
Employer contribution: gross × 6%  (deposited to employee's individual account)
Does NOT reduce employee net salary
```

#### Step 12 — Income Tax Withholding (所得稅扣繳)
```
pre_tax_net = gross - leave_deduction - late_deduction - labor_ins_employee - health_ins_employee
Find bracket in income_tax_brackets (Taiwan 2024 progressive monthly withholding)
income_tax_withheld = pre_tax_net × tax_rate + fixed_amount

Brackets (2024):
  ≤ 88,500 NTD/month → 0%
  88,501 – 111,000   → 5%
  111,001 – 139,500  → 10%
  139,501 – 166,500  → 15%
  166,501 – 222,000  → 20%
  > 222,000          → 30%
```

#### Step 13 — Net Salary
```
net_salary = gross - leave_deduction - late_deduction
           - labor_ins_employee - health_ins_employee - income_tax_withheld
```

---

### 5.4 Taiwan Insurance Brackets — Annual Data (2020–2026)

Brackets are stored per year in `labor_ins_brackets(year, grade)` and `health_ins_brackets(year, grade)`. The payroll engine automatically fetches the correct year's table based on the pay period. The reference tab in `/payroll` has a year selector (2020–2026).

**Sources**: Bureau of Labor Insurance (勞工保險局) · National Health Insurance Administration (中央健保署)

#### Labor Insurance Rates by Year (勞工保險費率)

| Year | Total Rate | Employee (20%) | Employer (70%) | Min Wage (Grade 1) | Grades |
|------|-----------|----------------|----------------|--------------------|--------|
| 2020 | 11.0% | 2.2% | 7.7% | NT$23,800 | 16 |
| 2021 | 11.5% | 2.3% | 8.05% | NT$24,000 | 15 |
| 2022 | 11.5% | 2.3% | 8.05% | NT$25,250 | 14 |
| 2023 | 12.0% | 2.4% | 8.4% | NT$26,400 | 13 |
| 2024 | 12.0% | 2.4% | 8.4% | NT$27,470 | 12 |
| 2025 | 12.5% | 2.5% | 8.75% | NT$28,590 | 12 |
| 2026 | 12.5% | 2.5% | 8.75% | NT$29,500 | 11 |

Max insured salary (all years): NT$45,800

#### Health Insurance Rates by Year (全民健保費率)

| Year | Total Rate | Employee (30%) | Employer (60%) | Min Wage (Grade 1) | Grades |
|------|-----------|----------------|----------------|--------------------|--------|
| 2020 | 4.69% | 1.407% | 2.814% | NT$23,800 | 33 |
| 2021 | 5.17% | 1.551% | 3.102% | NT$24,000 | 32 |
| 2022 | 5.17% | 1.551% | 3.102% | NT$25,250 | 31 |
| 2023 | 5.17% | 1.551% | 3.102% | NT$26,400 | 30 |
| 2024 | 5.17% | 1.551% | 3.102% | NT$27,470 | 29 |
| 2025 | 5.17% | 1.551% | 3.102% | NT$28,590 | 29 |
| 2026 | 5.17% | 1.551% | 3.102% | NT$29,500 | 27 |

Max insured salary: NT$103,300 (33 grades extend to higher income earners)

> **Health insurance `employee_premium`** stores the per-unit amount. The application multiplies it by `(1 + health_ins_dependents)` from `salary_structures` to get the actual employee deduction.

Full tables viewable in admin under `/payroll` → 保費對照表 tab (year selector: 2020–2026).

---

### 5.5 Payroll Run Workflow

```
1. Select pay period (YYYY-MM)
2. Click "計算薪資" → calculatePayroll() runs
3. Preview table shown (all employees, all line items)
4. Review stat summary: employee count, total gross, total deductions, total net, employer pension
5. Click "確認薪資" → payroll_runs (status: confirmed) + payroll_records saved
6. (Optional) "匯出 CSV" → download accounting-ready CSV with UTF-8 BOM
7. (Optional) "發送薪資單" → POST to send-payslips edge function
```

---

### 5.6 Payslip Distribution

The `send-payslips` edge function:

1. Loads all `payroll_records` for the given `payroll_run_id`
2. Joins with `line_employee_mapping` to find LINE user IDs
3. Sends a LINE Flex Message payslip to each linked employee
4. Updates `payroll_records.payslip_sent_at` for sent records
5. Returns `{ sent: N, skipped: M }` (skipped = no LINE account linked)

**Payslip Flex Message** shows: all earnings line items, gross total, all deductions, net salary in large indigo text.

---

## 6. Mobile LIFF App (Employee Self-Service)

Route: `/liff/app`

6-tab bottom navigation bar:

| Tab | Icon | Features |
|-----|------|---------|
| 打卡 | MapPin | GPS/WiFi clock-in, store info, distance indicator, today's records, correction form |
| 班表 | Calendar | Current month's shift assignments |
| 工時 | Clock | Work hours history, punch correction request button per record |
| 請假 | Plane | Leave balance display, leave request form (type, dates, reason) |
| 薪資單 | FileText | Payslip list (last 12 months), tap to view full breakdown |
| 偏好 | Settings | Personal preferences |

### Payslip Detail View

Tapping a month in the 薪資單 tab shows:
- Indigo header with period and total hours worked
- Earnings breakdown (only non-zero items shown)
- Deductions breakdown (in red)
- Large net salary display
- "← 返回" button to go back to month list

---

## 7. LINE Bot Commands

Employees can message the LINE Bot directly for HR information:

| Keyword(s) | Response |
|-----------|---------|
| `假期餘額`, `特休`, `假期` | Leave balance table — all leave types, used/remaining days |
| `請假`, `請假申請` | Link to LIFF leave request form |
| `加班記錄`, `本月加班`, `我的加班`, `加班時數`, `加班` | Current month OT summary + 8-row detail table |
| `薪資單`, `薪資`, `我的薪資`, `查薪資` | Last 3 months' payslips in carousel (gross + net per month) |

All commands require the employee's LINE account to be linked via `line_employee_mapping`.

### HR Notifications (hr-notify edge function)

The following events trigger a LINE push notification to the employee:

| Event | Message Style |
|-------|--------------|
| Leave approved | Green header Flex Message |
| Leave rejected | Red header Flex Message |
| Overtime approved | Green header Flex Message |
| Overtime rejected | Red header Flex Message |
| Punch correction approved | Green header Flex Message |
| Punch correction rejected | Red header Flex Message |
| Payslip sent | Indigo header Flex Message with full breakdown |

---

## 8. Database Schema Reference

### HR Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `time_records` | Clock-in/out records | user_id, clock_in, clock_out, clock_in_method, clock_in_distance_m |
| `punch_corrections` | Correction requests | user_id, requested_time, correction_type, status, reason |
| `leave_requests` | Leave applications | user_id, leave_type, start_date, end_date, total_days, status |
| `leave_balances` | Leave quota per employee | user_id, year, leave_type, total_days, used_days (UNIQUE user+year+type) |
| `overtime_requests` | OT applications | user_id, ot_date, ot_hours, ot_type, status, pre_post |
| `shift_assignments` | Scheduled shifts | user_id, schedule_id, date, shift_type, start_time, end_time |

### Payroll Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `salary_structures` | Employee salary config | user_id, org_id, base_salary, allowances, salary_type (UNIQUE org+user) |
| `labor_ins_brackets` | Labor insurance grades | grade (PK), min_salary, insured_salary, employee_premium, employer_premium |
| `health_ins_brackets` | Health insurance grades | grade (PK), min_salary, insured_salary, employee_premium, employer_premium |
| `payroll_runs` | Monthly payroll batches | org_id, pay_period, status, total_gross, total_net (UNIQUE org+period) |
| `payroll_records` | Per-employee payroll | payroll_run_id, user_id, pay_period, gross_salary, net_salary, payslip_sent_at |

### Store Configuration

| Table | Payroll-relevant columns |
|-------|------------------------|
| `stores` | gps_lat, gps_lng, gps_radius_m, clock_in_method, wifi_allowed_ips |

---

## 9. Edge Functions Reference

| Function | Trigger | Purpose |
|----------|---------|---------|
| `line-webhook` | LINE platform POST | Handle all LINE messages + HR keyword commands |
| `hr-notify` | Admin actions | Push approve/reject notifications to employees |
| `send-payslips` | Admin clicks "發送薪資單" | Batch push payslip Flex Messages to all employees |
| `liff-new-task` | LIFF form submit | Create tasks from mobile |
| `liff-task` | LIFF task interaction | Update task status from mobile |
| `workflow-ai` | Workflow engine | AI-powered workflow processing |
| `task-ai-agent` | Task management | AI task agent |

---

## 10. Admin Navigation Map

```
Sidebar
├── 主選單
│   ├── / .............. Dashboard (with HR KPI cards)
│   └── /manager-dashboard .. Operations Dashboard
│
├── 人資管理 (HR Management) [collapsible]
│   ├── /hr-dashboard ....... HR Reports + Risk Alerts
│   ├── /time-tracker ....... Clock-in Records + Corrections
│   ├── /leave-management ... Leave Approvals + Balances
│   ├── /overtime-requests .. OT Approvals + Risk Grid
│   ├── /payroll ............ Payroll Engine (Phase 4)
│   ├── /scheduling ......... Shift Scheduling
│   ├── /holidays ........... Holiday Management
│   └── /shift-rules ........ Labor Law Reference
│
├── 流程管理 (Workflows) [collapsible]
│   └── /workflow-management .. (tabs: dashboard, workflows, tasks, checklists)
│
├── 組織管理 (Org Management) [collapsible]
│   └── /org-management ...... (tabs: orgs, companies, locations, departments, employees, line, billing)
│
└── 系統 (System)
    ├── /triggers ........... Event Triggers
    ├── /notifications ...... Notification Log
    ├── /users .............. System Users
    └── /admin .............. Admin Settings
```

---

## Implementation Phases Summary

| Phase | Modules | Status |
|-------|---------|--------|
| **Phase 1** | Mobile clock-in (GPS/WiFi), Leave management, Overtime requests, Punch corrections | ✅ Complete |
| **Phase 2** | Shift scheduling, Labor law violation checks (七休一, 11h rest), Store GPS config | ✅ Complete |
| **Phase 3** | HR Dashboard (hours, CSV export, 4 risk alerts including absence detection) | ✅ Complete |
| **Phase 4** | Payroll engine (salary structures, Taiwan insurance brackets, calculation, payslip distribution via LINE) | ✅ Complete |
| **Phase 4b** | Employee record expansion (name fields, identity, banking, insurance enrollment, dependents, position history) | ✅ Complete |
| **Phase 4c** | Payroll bonus & tax (year-end bonus, income tax withholding, late deduction, ad-hoc bonus, LIFF payslip detail) | ✅ Complete |
| **Phase 5** | Payroll ERP integration (鼎新/文中), Audit logs, Document management | 🔲 Planned |
| **Phase 6** | Recruitment/ATS, Performance management, Training records | 🔲 Future |
| **Phase 7** | AI analytics, SaaS multi-tenant, API platform | 🔲 Long-term |

---

## Bug Fixes

### BUG-01 — Employee Form: Silent Validation on Empty Name
- **File**: `admin/src/pages/Employees.tsx` (line 293)
- **Symptom**: Clicking Save with an empty name field silently did nothing — `createEmployee()` returned early with `if (!form.name) return` and showed no user feedback.
- **Fix**: Added `createError` state; the function now sets an inline error message (`"姓名為必填欄位" / "Name is required"`) displayed below the name field. Error clears on input change or Cancel.
- **Status**: ✅ Fixed — TC-E-02 now passes with validation feedback confirmed.

### BUG-02 — Workflow Template Form: Silent Validation on Empty Name
- **File**: `admin/src/pages/Workflows.tsx` (line 297)
- **Symptom**: Same pattern as BUG-01 — `createTemplate()` returned early with `if (!newName.trim()) return` with no visual feedback to the user.
- **Fix**: Added `templateNameError` state; displays `"範本名稱為必填欄位" / "Template name is required"` below the template name field. Clears on input or Cancel.
- **Status**: ✅ Fixed — TC-W-02 now passes with validation feedback confirmed.

### BUG-03 — LIFF App: Wrong Column Name in `employee_availability` Query
- **File**: `admin/src/pages/LiffApp.tsx` (line 197)
- **Symptom**: Console error `column employee_availability.employee_id does not exist` when loading employee availability in the LIFF scheduling tab. The DB table uses `user_id` but the query used `.eq('employee_id', empId)`.
- **Fix**: Changed `.eq('employee_id', empId)` → `.eq('user_id', empId)` to match the actual column name used everywhere else (`Employees.tsx`, `Scheduling.tsx`).
- **Status**: ✅ Fixed — query now uses the correct column name.
