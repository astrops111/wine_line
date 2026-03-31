# HRM System — Feature & Process Documentation

> **System**: AI LINE Bot Operations System — Human Resource Management Module
> **Stack**: React + TypeScript (Vite) · Supabase (PostgreSQL + Edge Functions + RLS) · LINE LIFF · LINE Messaging API
> **Compliance**: Taiwan Labor Standards Act (勞動基準法)
> **Last Updated**: 2026-03-29

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
11. [Phase 5 — Enterprise Features (2026-03-28)](#11-phase-5--enterprise-features-2026-03-28)
12. [Phase 5b — AI Documentation & Agent System](#12-phase-5b--ai-documentation--agent-system)
13. [Phase 5c — LINE Analytics & Logging](#13-phase-5c--line-analytics--logging)
14. [Permission System (RBAC)](#14-permission-system-rbac)
15. [Theme System (Dark Mode)](#15-theme-system-dark-mode)
16. [Phase 6 — Scheduling AI & Compliance (2026-03-29)](#16-phase-6--scheduling-ai--compliance-2026-03-29)
17. [Phase 6b — Onboarding, Training & Communications](#17-phase-6b--onboarding-training--communications)
18. [Phase 6c — Scheduling Enhancements & Gap Closures](#18-phase-6c--scheduling-enhancements--gap-closures)
19. [Phase 6d — Tiered Summaries & LLM Cost Tracking](#19-phase-6d--tiered-summaries--llm-cost-tracking)

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
| KPI tracking (weighted scoring, target vs actual) | ✅ Done |
| Performance reviews (monthly/quarterly/semi-annual/annual) | ✅ Done |
| Review workflow (draft → submitted → acknowledged → closed) | ✅ Done |
| Strengths, improvements, goals documentation | ✅ Done |
| Promotion workflows | 🔲 Future |
| Disciplinary logs (verbal/written warning, merit, commendation, termination) | ✅ Done |
| Training records + certification tracking (food handler, fire safety, etc.) | ✅ Done |

#### 🧲 Recruitment / ATS

| Feature | Status |
|---------|--------|
| Job posting management (draft/open/closed/filled) | ✅ Done |
| Candidate pipeline (applied → screening → interview → offer → hired/rejected) | ✅ Done |
| Interview scheduling (phone/video/onsite/technical/HR) | ✅ Done |
| Interview feedback and scoring | ✅ Done |
| Candidate source tracking | ✅ Done |
| Resume attachment storage | ✅ Done |
| Headcount and salary range per position | ✅ Done |

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
| Employee document uploads (contracts, ID, resumes, certificates) | ✅ Done |
| Expiry date tracking with countdown alerts | ✅ Done |
| File type categorization with color-coded badges | ✅ Done |
| Document metadata (uploader, timestamp, MIME type, size) | ✅ Done |
| Payslip archive | 🔲 Partial (sent_at tracked, no PDF archive) |

#### 🧾 Audit Logs
| Feature | Status |
|---------|--------|
| System action logging (create/update/delete/export/login/approve/reject) | ✅ Done |
| Module-level filtering (payroll/leave/overtime/employee/scheduling/workflow/performance) | ✅ Done |
| Change tracking with old_values / new_values diff | ✅ Done |
| IP address logging | ✅ Done |
| Tabs: All logs, HR-specific, System-only | ✅ Done |
| Compliance audit report | 🔲 Future |

---

### Layer 6 — Experience Layer

#### 📈 Dashboard & Analytics
| Feature | Status |
|---------|--------|
| HR Dashboard (hours, risk alerts) | ✅ Done |
| Store Manager Dashboard | ✅ Done |
| Executive / LIFF Manager Dashboard | ✅ Done |
| LIFF Mobile Manager Dashboard (real-time store metrics) | ✅ Done |
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
| Multi-agent orchestration system | ✅ Done |
| AI documentation generation pipeline | ✅ Done |
| RAG-powered help center with chatbot | ✅ Done |
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
| Gap | Priority | Status |
|-----|----------|--------|
| ~~Recruitment / ATS module~~ | ~~High~~ | ✅ Done (Phase 5) |
| ~~Audit logs (all HR actions)~~ | ~~High~~ | ✅ Done (Phase 5) |
| ~~Document management (contracts, ID)~~ | ~~High~~ | ✅ Done (Phase 5) |
| Integration layer (ERP, accounting) | High | 🔲 Pending |

#### 🟡 High-Value Additions
| Gap | Priority | Status |
|-----|----------|--------|
| ~~Performance management + KPI~~ | ~~Medium~~ | ✅ Done (Phase 5) |
| ~~Training records / LMS~~ | ~~Medium~~ | ✅ Done (Phase 6b) |
| ~~Expense management~~ | ~~Medium~~ | ✅ Done (Phase 5) |
| Multi-legal-entity payroll | Medium | 🔲 Pending |
| 扣繳憑單 (annual tax certificate) | Medium | 🔲 Pending |

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
| **Phase 1** | Timesheet, Scheduling, Employee management, Dashboard | ✅ Done |
| **Phase 2** | Full Payroll, Leave automation, Workflow triggers | ✅ Done |
| **Phase 3** | HR Dashboard, Risk monitoring, Absence detection | ✅ Done |
| **Phase 4** | Payroll engine, Insurance brackets, Payslip distribution | ✅ Done |
| **Phase 5** | Audit logs, Document mgmt, Performance, Recruitment/ATS, Expenses, Business trips | ✅ Done |
| **Phase 5b** | AI documentation pipeline, Multi-agent orchestration, Help center with RAG chatbot | ✅ Done |
| **Phase 5c** | LINE bot analytics, Message/command/error logging, Daily group summaries | ✅ Done |
| **Phase 6** | Scheduling AI, Demand forecasting, Task attachments, Audit logging utility | ✅ Done |
| **Phase 6b** | Onboarding/offboarding, Training/certs, Announcements, Disciplinary records | ✅ Done |
| **Phase 6c** | Variable working hours, Open shift marketplace, Schedule templates, Labor budgeting, Employee skills, Employee numbers, Multi-level approvals, Work permits, Scheduling KPIs | ✅ Done |
| **Phase 6d** | Tiered LINE summaries (weekly/monthly AI), LLM usage tracking, Data pruning, Minimum-admin safety, Access levels | ✅ Done |
| **Phase 7** | Payroll ERP integration (鼎新/文中), Drag-and-drop schedule editor | 🔲 Next |
| **Phase 8** | AI analytics, Multi-tenant SaaS, API platform | 🔲 Long-term |

---

## 1. System Architecture (Technical)

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Web Panel                         │
│  React 19 + TypeScript · Vite · Dark/Light Theme            │
│  RBAC: PermissionGuard (module_access + role gates)         │
│  34+ Routes: HR, Payroll, Performance, Recruitment,         │
│              Onboarding, Training, Announcements, AI, LIFF  │
└────────────────────┬────────────────────────────────────────┘
                     │ Supabase JS Client
┌────────────────────▼────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                       │
│  HR: time_records, shift_assignments, leave_requests,       │
│      overtime_requests, leave_balances, punch_corrections   │
│  Payroll: salary_structures, payroll_runs, payroll_records, │
│           labor_ins_brackets, health_ins_brackets            │
│  Enterprise: audit_logs, performance_reviews, candidates,   │
│              job_postings, employee_documents, expense_claims│
│  Ops: announcements, onboarding_tasks, training_records,    │
│       disciplinary_records, approval_chains, employee_skills│
│  Scheduling: schedule_templates, scheduling_kpis,           │
│              daily_demand, pos_integrations                  │
│  AI: help_articles (FTS), agent_registry, agent_tasks       │
│  LINE: line_messages, line_command_logs, line_error_logs,   │
│        line_daily_summaries, line_groups                     │
│  RLS: enabled on all tables                                 │
└──────┬──────────────────────────────────────┬───────────────┘
       │ Deno Edge Functions                  │
┌──────▼──────────┐  ┌───────────────┐  ┌────▼──────────────┐
│  hr-notify      │  │  orchestrator │  │  send-payslips    │
│  line-webhook   │  │  help-chatbot │  │  liff-new-task    │
│  workflow-ai    │  │  doc-*  (×3)  │  │  liff-task        │
│  scheduling-ai  │  │  demand-fore  │  │  summarize-hist   │
└──────┬──────────┘  └───────┬───────┘  └───────────────────┘
       │                     │ AI (Claude / Gemini / DashScope)
       │ LINE Messaging API  │
┌──────▼──────────────────────────────────────────────────────┐
│  Employee LINE App                                           │
│  LIFF: /liff/app  — 6 tabs: 打卡·班表·工時·請假·薪資單·偏好  │
│  LIFF: /liff/dashboard — Manager mobile dashboard            │
└─────────────────────────────────────────────────────────────┘
```

### Key Shared Libraries

| File | Purpose |
|------|---------|
| `admin/src/lib/supabase.ts` | Supabase client + `FUNCTIONS_URL` export |
| `admin/src/lib/OrgContext.tsx` | `useOrg()` hook — provides `orgId`, `userRoles`, `modules` |
| `admin/src/lib/i18n.ts` | `getLocale()` / `t()` — bilingual zh-TW / en |
| `admin/src/lib/geo.ts` | `haversineDistance()`, `isWithinRadius()`, `getCurrentPosition()` |
| `admin/src/lib/permissions.ts` | `canAccess()`, `getModuleForPath()` — RBAC helpers |
| `admin/src/lib/theme.ts` | `setTheme()`, `getTheme()`, `initTheme()` — dark/light mode |
| `admin/src/lib/auditLog.ts` | `writeAuditLog()` — compliance audit trail logging |

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

### Enterprise Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `audit_logs` | Operation audit trail | action, module, user_name, old_values, new_values, ip_address |
| `performance_reviews` | Employee reviews | user_id, period_type, status (draft/submitted/acknowledged/closed), overall_score |
| `performance_kpis` | KPI tracking | review_id, kpi_name, weight, target, actual |
| `job_postings` | Recruitment positions | title, department, headcount, salary_min/max, status |
| `candidates` | Applicants | job_posting_id, name, email, stage, source, resume_url |
| `interviews` | Interview scheduling | candidate_id, interview_type, scheduled_at, feedback, score |
| `employee_documents` | Document management | user_id, doc_type, file_url, expiry_date, mime_type, file_size |
| `business_trips` | Travel requests | user_id, destination, purpose, dates, budget, status |
| `expense_claims` | Expense reimbursement | user_id, category, amount, currency, business_trip_id, status |
| `announcements` | Company announcements | title, content, priority, target_type, target_id, is_pinned, expires_at |
| `announcement_reads` | Read tracking | announcement_id, user_id, read_at |
| `disciplinary_records` | Discipline/merit | employee_id, type, description, issued_by, effective_date |
| `training_records` | Training + certs | employee_id, course_name, cert_type, expiry_date, hours |
| `onboarding_templates` | Onboarding templates | name, type (onboarding/offboarding), items (JSONB) |
| `onboarding_tasks` | Per-employee tasks | user_id, template_id, title, status, assignee_id, due_date |
| `task_attachments` | Task file uploads | task_id, file_name, storage_path, mime_type, file_size |
| `approval_chains` | Multi-level approvals | module, level, approver_role, min_days, min_amount |

### Scheduling Enhancement Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `schedule_templates` | Reusable schedule patterns | store_id, name, assignments (JSONB) |
| `employee_skills` | Skill/cert tagging | user_id, skill_name, proficiency, expires_at |
| `scheduling_kpis` | Schedule performance metrics | store_id, week_start, acceptance_rate, violations, ot_hours |
| `pos_integrations` | POS system connections | store_id, provider (square/iCHEF), api_key_encrypted |
| `daily_demand` | Demand data (POS/manual) | store_id, date, revenue, transactions, foot_traffic, weather |

### AI & Agent Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `help_articles` | Documentation articles | title, content (zh+en), category, page_route (UNIQUE), fts_zh, fts_en |
| `agent_registry` | Agent definitions | name, team_name, endpoint, description, capabilities |
| `agent_tasks` | Agent execution log | orchestration_id, agent_name, status, input, output, error |

### LINE Analytics Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `line_groups` | LINE group registry | line_group_id (UNIQUE), group_name, group_type, is_active |
| `line_messages` | Message log | line_user_id, message_text, direction, source_type, group_id |
| `line_command_logs` | Command tracking | command_matched, raw_input, success, execution_ms, metadata |
| `line_error_logs` | Error tracking | error_type, error_message, error_stack, context |
| `line_daily_summaries` | Daily aggregations | group_id, summary_date, message_count, unique_users, summary_text |
| `line_weekly_summaries` | Weekly AI summaries | group_id, week_start, key_decisions[], action_items[], recurring_topics[] |
| `line_monthly_summaries` | Monthly AI summaries | group_id, summary_month, notable_events[], key_decisions[] |
| `llm_usage_logs` | LLM API cost tracking | function_name, provider, model, tokens, estimated_cost, latency_ms |

### Enhanced Column Additions (Phase 6c)

| Table | New Columns | Purpose |
|-------|------------|---------|
| `stores` | working_hour_type, variable_period_start, default_labor_budget, hourly_rate_default | Variable working hours + labor budgeting |
| `schedules` | labor_budget, budget_alert_threshold | Per-week budget tracking |
| `shift_templates` | required_skills (TEXT[]) | Skill-based scheduling |
| `shift_swap_requests` | bid_user_id, bid_message, bid_at | Open shift marketplace |
| `users` | employee_number, work_permit_number, work_permit_expiry | Employee ID + foreign worker tracking |
| `payroll_records` | supplementary_nhi, leave_buyout | NHI supplement + leave buyout |

### Store Configuration

| Table | Payroll-relevant columns |
|-------|------------------------|
| `stores` | gps_lat, gps_lng, gps_radius_m, clock_in_method, wifi_allowed_ips |

---

## 9. Edge Functions Reference

| Function | Trigger | AI Model | Purpose |
|----------|---------|----------|---------|
| `line-webhook` | LINE platform POST | DashScope Qwen | Handle all LINE messages + HR keyword commands |
| `hr-notify` | Admin actions | — | Push approve/reject notifications to employees |
| `send-payslips` | Admin clicks "發送薪資單" | — | Batch push payslip Flex Messages to all employees |
| `liff-new-task` | LIFF form submit | — | Create tasks from mobile |
| `liff-task` | LIFF task interaction | — | Update task status from mobile |
| `workflow-ai` | Workflow engine | DashScope Qwen | AI-powered workflow processing |
| `task-ai-agent` | Task management | DashScope Qwen | AI task agent |
| `orchestrator` | Agent Console / script | Claude → Gemini 2.5 | Multi-agent pipeline coordinator |
| `doc-flow-analyzer` | Orchestrator pipeline | DashScope → Gemini 2.5 | Extract user/operational flows from page manifest |
| `doc-content-gen` | Orchestrator pipeline | DashScope → Gemini 2.5 | Generate bilingual help articles from flows |
| `doc-indexer` | Orchestrator pipeline | — | Upsert articles into `help_articles` table |
| `help-chatbot` | Help Center UI | Claude → Gemini 2.5 | RAG Q&A — FTS search + LLM answer generation |
| `scheduling-ai` | Scheduling page "🤖 AI 自動排班" | Claude | AI schedule generation with 10+ labor law validations |
| `demand-forecast` | Scheduling analytics | DashScope Qwen | Staffing prediction from POS/historical data |
| `summarize-history` | Cron (weekly/monthly) | Qwen → Gemini → Claude | Generate weekly/monthly LINE group chat summaries |

---

## 10. Admin Navigation Map

```
Sidebar
├── 主選單 (MAIN MENU)
│   ├── / .................. Dashboard (HR KPI cards)
│   └── /manager-dashboard . Operations Dashboard
│
├── 人資管理 (HR MANAGEMENT) [collapsible, 18 items]
│   ├── /hr-dashboard ...... HR Reports + Risk Alerts
│   ├── /time-tracker ...... Clock-in Records + Corrections
│   ├── /leave-management .. Leave Approvals + Balances
│   ├── /overtime-requests . OT Approvals + Risk Grid
│   ├── /payroll ........... Payroll Engine
│   ├── /scheduling ........ Shift Scheduling
│   ├── /holidays .......... Holiday Management
│   ├── /shift-rules ....... Labor Law Reference
│   ├── /performance ....... Performance Reviews + KPIs ← NEW
│   ├── /recruitment ....... Recruitment ATS ← NEW
│   ├── /documents ......... Document Management ← NEW
│   ├── /audit-logs ........ Audit Trail ← NEW
│   ├── /business-trips .... Business Trip Requests
│   ├── /expense-claims .... Expense Reimbursement
│   ├── /onboarding ........ Onboarding/Offboarding ← NEW
│   ├── /announcements ..... Company Announcements ← NEW
│   ├── /training .......... Training & Certs ← NEW
│   └── /disciplinary ...... Disciplinary Records ← NEW
│
├── 流程管理 (WORKFLOWS) [collapsible]
│   └── /workflow-management (tabs: dashboard, workflows, tasks, checklists)
│
├── 組織管理 (ORG MANAGEMENT) [collapsible]
│   └── /org-management .... (tabs: orgs, companies, locations, departments, employees, line, billing)
│
├── 系統 (SYSTEM)
│   ├── /triggers .......... Event Triggers
│   ├── /notifications ..... Notification Log
│   ├── /users ............. System Users
│   ├── /audit-logs ........ Audit Logs ← NEW
│   ├── /line-logs ......... LINE Analytics ← NEW
│   ├── /performance ....... Performance ← NEW
│   └── /admin ............. Admin Settings
│
├── AI 工具 (AI TOOLS) ← NEW section
│   ├── /help-center ....... Help Center (RAG + chatbot)
│   └── /agent-console ..... Agent Console (orchestration)
│
└── LIFF Routes (no sidebar — standalone)
    ├── /liff/app .......... Employee Self-Service App
    └── /liff/dashboard .... Manager Mobile Dashboard ← NEW
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
| **Phase 5** | Audit logs, Document management, Performance reviews, Recruitment/ATS, Business trips, Expense claims, RBAC, Dark mode | ✅ Complete |
| **Phase 5b** | AI multi-agent orchestration, Documentation pipeline, Help center with RAG chatbot | ✅ Complete |
| **Phase 5c** | LINE bot analytics — message/command/error logging, Daily group summaries | ✅ Complete |
| **Phase 6** | Scheduling AI (Claude + validation), Demand forecasting, Audit logging utility, Task attachments | ✅ Complete |
| **Phase 6b** | Onboarding/offboarding workflows, Training/certification tracking, Announcements, Disciplinary records | ✅ Complete |
| **Phase 6c** | Variable working hours (變形工時), Open shift marketplace, Schedule templates, Labor budgeting, Employee skills/certs, Employee numbers, Multi-level approvals, Work permit tracking, Scheduling KPIs | ✅ Complete |
| **Phase 7** | Payroll ERP integration (鼎新/文中), Drag-and-drop schedule editor | 🔲 Planned |
| **Phase 8** | AI predictive analytics, Multi-tenant SaaS, API platform | 🔲 Long-term |

---

## 11. Phase 5 — Enterprise Features (2026-03-28)

### 11.1 Performance Management (`PerformanceManagement.tsx`)

Route: `/performance`

#### Tabs

| Tab | Content |
|-----|---------|
| Reviews | Create, view, and manage performance reviews per employee |
| Analytics | Performance trends and score distributions |

#### Review Lifecycle

```
Manager creates review → status: draft
  → Manager submits → status: submitted
    → Employee acknowledges → status: acknowledged
      → HR closes → status: closed
```

#### KPI Tracking

Each review contains weighted KPIs with target vs actual scoring:
- Overall score calculated as weighted average
- Color-coded progress bars (green ≥ 80%, amber ≥ 60%, red < 60%)
- Free-text fields: strengths, areas for improvement, goals

#### Review Period Types

`monthly` | `quarterly` | `semi-annual` | `annual`

---

### 11.2 Recruitment ATS (`RecruitmentATS.tsx`)

Route: `/recruitment`

#### Job Posting Management

| Field | Description |
|-------|-------------|
| Title, description | Position details |
| Department, location | Organizational placement |
| Headcount | Number of open positions |
| Salary range (min/max) | Compensation band |
| Status | `draft` → `open` → `closed` / `filled` |
| Open/close dates | Posting validity window |

#### Candidate Pipeline

6-stage funnel:
```
Applied → Screening → Interview → Offer → Hired
                                       ↘ Rejected
```

#### Interview Types

`phone` | `video` | `onsite` | `technical` | `HR`

Each interview tracks: scheduled time, interviewer, feedback, score.

---

### 11.3 Document Management (`DocumentManagement.tsx`)

Route: `/documents`

#### Tabs

| Tab | Content |
|-----|---------|
| Documents | List of all employee documents with filters |
| Upload | Upload new documents with metadata |
| Expiring | Documents approaching or past expiry date |

#### Document Types

Contracts, ID cards, resumes, certificates, permits — each with color-coded badges.

#### Features

- Expiry countdown with urgency indicators
- File metadata: MIME type, size, uploader, upload timestamp
- Filter by employee and document category

---

### 11.4 Audit Logs (`AuditLogs.tsx`)

Route: `/audit-logs`

#### Log Entry Structure

| Field | Description |
|-------|-------------|
| `action` | create / update / delete / export / login / approve / reject |
| `module` | payroll / leave / overtime / employee / scheduling / workflow / performance |
| `user_name` | Actor who performed the action |
| `record_label` | Human-readable description of affected record |
| `old_values` | JSONB snapshot before change |
| `new_values` | JSONB snapshot after change |
| `ip_address` | Client IP at time of action |
| `created_at` | Timestamp |

#### Tabs

| Tab | Filter |
|-----|--------|
| All | All log entries |
| HR | Module in (payroll, leave, overtime, employee, scheduling) |
| System | Module in (workflow, performance, system) |

---

### 11.5 Business Trips (`BusinessTrips.tsx`)

Route: `/business-trips`

#### Fields

| Field | Description |
|-------|-------------|
| Destination | Trip location |
| Purpose | Business justification |
| Start/return dates | Trip duration |
| Transport budget | Estimated transport costs |
| Accommodation budget | Estimated lodging costs |
| Status | `pending` → `approved` / `rejected` → `cancelled` |
| Notes | Special instructions |

Admin/manager sees all trips; staff see only their own.

---

### 11.6 Expense Claims (`ExpenseClaims.tsx`)

Route: `/expense-claims`

#### Workflow

```
Employee submits claim → status: pending
  → Manager approves → status: approved
    → Finance reimburses → status: reimbursed
  → Manager rejects → status: rejected
```

#### Fields

Date, category, description, amount, currency. Can be linked to a business trip for trip-related expenses.

---

### 11.7 LIFF Manager Dashboard (`LiffManagerDashboard.tsx`)

Route: `/liff/dashboard` (standalone, no sidebar)

Mobile-optimized dashboard for store managers:
- Real-time store progress with completion percentages
- Blocked, in-progress, pending task counts per store
- Delayed task alerts with priority and overdue days
- Live activity feed with task updates
- Gradient header with store metrics overlay
- Auto-refresh capability

---

## 12. Phase 5b — AI Documentation & Agent System

### 12.1 Multi-Agent Orchestration

The system uses a multi-agent architecture where a coordinator routes tasks to specialized agent teams.

#### Agent Registry (`agent_registry` table)

| Agent | Team | Endpoint | Purpose |
|-------|------|----------|---------|
| `flow-analyzer` | documentation | `/doc-flow-analyzer` | Extract user/operational flows from page manifest |
| `content-generator` | documentation | `/doc-content-gen` | Generate bilingual Markdown articles |
| `indexer` | documentation | `/doc-indexer` | Upsert articles into DB with FTS indexing |
| `help-chatbot` | documentation | `/help-chatbot` | On-demand RAG Q&A |

#### AI Model Fallback Chain

| Function Type | Primary | Fallback |
|---------------|---------|----------|
| Content generation (doc-flow-analyzer, doc-content-gen) | DashScope Qwen 3.5 Plus | Gemini 2.5 Flash |
| Orchestration planning | Claude Opus 4.6 | Gemini 2.5 Flash |
| Help chatbot (RAG answers) | Claude Opus 4.6 | Gemini 2.5 Flash |

#### Documentation Pipeline

```
Page Manifest (19 pages)
  → doc-flow-analyzer (batches of 5 pages)
    → Extracts 2–4 user/operational flows per page
  → doc-content-gen (batches of 5 flows)
    → Generates bilingual zh-TW + en Markdown articles
  → doc-indexer (batches of 5 articles)
    → Upserts into help_articles with FTS vectors
```

**Pipeline Runner**: `admin/scripts/generate-docs.mjs` — runs the pipeline locally to bypass Supabase's 60s edge function timeout. Batches of 5 with 800ms delays.

#### Full-Text Search

PostgreSQL FTS using `TSVECTOR GENERATED ALWAYS AS ... STORED`:
- `fts_zh`: `to_tsvector('simple', title || ' ' || content)` — Chinese search
- `fts_en`: `to_tsvector('english', title_en || ' ' || content_en)` — English search
- No vector embeddings required — pure FTS with deduplication

---

### 12.2 Help Center (`HelpCenter.tsx`)

Route: `/help-center`

#### Layout

- **Left panel**: Category filter tabs (All / HR / Workflows / System / LIFF) + article list
- **Center panel**: Selected article rendered as Markdown
- **Right panel**: AI chatbot (slide-in) with source badges linking to articles

#### Features

- Debounced client-side search (300ms)
- "🔄 Re-generate Docs" button calls the orchestrator with confirmation dialog
- Bilingual content display based on current locale
- Clickable source badges in chatbot navigate to the referenced article

---

### 12.3 Agent Console (`AgentConsole.tsx`)

Route: `/agent-console`

#### Tabs

| Tab | Content |
|-----|---------|
| 📊 Overview | Completed runs, failed tasks, article count, architecture diagram |
| 📋 Task Queue | Tasks grouped by `orchestration_id` (collapsible), 3s auto-polling |
| 🗂 Agent Registry | Registered agent teams and configurations |

#### Features

- "🚀 Run Orchestration" with optional custom task description
- Task status indicators: pending (grey), running (blue), completed (green), failed (red)

---

## 13. Phase 5c — LINE Analytics & Logging

### 13.1 LINE Logs (`LineLogs.tsx`)

Route: `/line-logs`

#### Tabs

| Tab | Content |
|-----|---------|
| Messages | All LINE messages (incoming/outgoing) with source type badges |
| Command Logs | Bot command executions with metadata, execution time (ms) |
| Error Logs | DB errors, LINE API errors, validation errors, stack traces |
| Daily Summaries | Auto-generated group chat summaries with user stats |

#### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `line_messages` | All LINE messages | line_user_id, message_text, direction, source_type, group_id |
| `line_command_logs` | Command tracking | command_matched, raw_input, success, execution_ms, metadata |
| `line_error_logs` | Error tracking | error_type, error_message, error_stack, context |
| `line_daily_summaries` | Daily group summaries | group_id, summary_date, message_count, unique_users, summary_text |
| `line_groups` | LINE groups registry | line_group_id, group_name, group_type, is_active |

#### Filters

- Filter by LINE group, user, date range
- Command label translation for 20+ command types
- Direction badges: incoming (blue) / outgoing (green)

---

## 14. Permission System (RBAC)

File: `admin/src/lib/permissions.ts`

### Role Hierarchy

| Required Role | Roles That Satisfy |
|---------------|-------------------|
| `all` | admin, manager, staff, operations |
| `staff` | admin, manager, staff, operations |
| `manager` | admin, manager, operations |
| `operations` | admin, operations |
| `admin` | admin only |

### Access Levels

Each module supports two access levels:

| Level | Description |
|-------|-------------|
| `full` | Read + write access (create, update, delete) |
| `read` | View-only access |

Check with `canWrite(moduleKey, modules, userRoles)` — returns `true` only if user has role access AND module `access_level === 'full'`.

### Module Access Control

Each module has an entry in the `module_access` table:

| Field | Description |
|-------|-------------|
| `module_key` | Route identifier (e.g. `payroll`, `audit-logs`) |
| `module_name_zh` / `module_name_en` | Display names |
| `is_enabled` | Admin toggle — disabled modules show "Module Disabled" card |
| `required_role` | Minimum role required for access |
| `access_level` | `full` or `read` — controls write permissions |
| `sort_order` | Sidebar ordering |

### Sub-Route Inheritance

Routes without their own module entry inherit permissions from a parent:

```typescript
SUB_ROUTE_PARENT_MAP = {
  '/tasks':      'workflow-management',
  '/workflows':  'workflow-management',
  '/checklists': 'workflow-management',
  '/employees':  'org-management',
};
```

### PermissionGuard Component

Wraps all routes in `<main>`. On each navigation:
1. Maps current `pathname` → `module_key` via `ROUTE_MODULE_MAP` or `SUB_ROUTE_PARENT_MAP`
2. If no module entry → pass through (uncontrolled route)
3. If `!is_enabled` → shows "🚫 Module Disabled" card
4. If `!canAccess(required_role, userRoles)` → shows "🔒 Access Denied" card with current roles
5. Otherwise → renders child route

### Production Mode

When `userRoles` is empty, `canAccess()` returns `false` — no access granted without authentication. This is production-safe behavior.

---

## 15. Theme System (Dark Mode)

File: `admin/src/lib/theme.ts`

### API

| Function | Description |
|----------|-------------|
| `initTheme()` | Called on app load; reads `localStorage.theme` and sets `data-theme` attribute |
| `getTheme()` | Returns current theme (`'light'` or `'dark'`) |
| `setTheme(theme)` | Persists to localStorage and updates `document.documentElement` attribute |

### Usage

Toggle button in sidebar footer: 🌙 (light mode) / ☀️ (dark mode). Theme persists across sessions via localStorage.

CSS variables are theme-aware via `[data-theme="dark"]` selectors in `index.css`.

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

---

## 16. Phase 6 — Scheduling AI & Compliance (2026-03-29)

### 16.1 Scheduling AI Edge Function (`scheduling-ai`)

Route: `POST /functions/v1/scheduling-ai`

AI-powered schedule generation with comprehensive Taiwan labor law validation.

#### Input Payload

```typescript
{
  store_id: string;
  week_start: string;          // "YYYY-MM-DD" (Monday)
  employees: Employee[];
  templates: ShiftTemplate[];
  availabilities: Availability[];
  leave_requests: LeaveRequest[];
  operating_hours: Record<string, any>;
  min_staff: number;
  prev_assignments?: PrevAssignment[];   // For consistency scoring
  user_instructions?: string;           // Natural language constraints
}
```

#### Output

```typescript
{
  assignments: Assignment[];     // Generated shift assignments
  violations: Violation[];       // Hard constraint violations (severity: 'error')
  warnings: Warning[];           // Soft constraint warnings (severity: 'warning')
  scores: {
    preference_score: number;    // 0–1, how well preferences matched
    consistency_score: number;   // 0–1, vs previous week
  };
  reasoning: string;             // LLM explanation (bilingual)
}
```

#### Validation Rules (10+ checks)

| Code | Rule | Type | Source |
|------|------|------|--------|
| H1 | No scheduling on leave days | Hard | Payload |
| H2 | No scheduling on unavailable days | Hard | Availability matrix |
| H3/H7 | Max hours per week (strict for part-time) | Hard | Employee config |
| H4 | 七休一 — max 6 consecutive working days | Hard | 勞基法 §36 |
| H5 | 11-hour rest between shifts | Hard | 勞基法 §36 |
| H6 | Only use provided shift templates | Hard | Validation |
| H8 | Full-time minimum hours warning (≥80% max) | Soft | Business rule |
| H9 | Break compliance (30min/4h, 60min/8h, 90min/12h) | Hard | 勞基法 §35 |
| H10 | Daily hours cap (max 12h, warn >8h) | Hard/Soft | 勞基法 §30 |
| S1 | Min staff per day coverage | Soft | Store config |
| S2 | Senior staff presence per day | Soft | Employee position |

#### Scoring

- **preference_score**: `(preferred_matches×1.0 + available_matches×0.5) / total_decisions`
- **consistency_score**: `matching_day_of_week_slots / total_assignments` vs previous week

---

### 16.2 Demand Forecast Edge Function (`demand-forecast`)

Route: `POST /functions/v1/demand-forecast`

AI staffing prediction using historical POS/manual data.

#### Input

```typescript
{
  store_id: string;
  week_start: string;
  historical_data?: { date, revenue, transactions, foot_traffic, weather, is_holiday }[];
}
```

#### Output

```typescript
{
  forecasts: {
    date: string;
    recommended_staff: number;
    confidence: number;        // 0–1
    reason: string;
  }[];
}
```

Uses DashScope Qwen to analyze last 60 days of revenue/traffic patterns by day-of-week, weather, and holidays.

---

### 16.3 Audit Logging Utility (`auditLog.ts`)

File: `admin/src/lib/auditLog.ts`

```typescript
writeAuditLog({
  organization_id: string;
  user_id?: string;
  user_name?: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject';
  module: string;
  table_name?: string;
  record_id?: string;
  record_label?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
}): Promise<void>
```

Non-blocking insert into `audit_logs`. Currently used in Tasks.tsx, extensible to all modules.

---

### 16.4 Task Attachments

Storage bucket: `task-attachments` (52MB limit)

| Allowed MIME Types |
|-------------------|
| PDF, JPEG, PNG, WebP, Word (.doc/.docx), Excel (.xls/.xlsx), TXT, CSV |

Table: `task_attachments` — file_name, storage_path, file_size, mime_type, uploaded_by.

---

## 17. Phase 6b — Onboarding, Training & Communications

### 17.1 Onboarding/Offboarding (`Onboarding.tsx`)

Route: `/onboarding`

#### Tabs

| Tab | Content |
|-----|---------|
| Templates | Reusable onboarding/offboarding checklists with items (JSONB) |
| Onboarding | Per-employee task tracking for new hires |
| Offboarding | Per-employee task tracking for departures |

#### Template Items Structure

```typescript
{ title: string, description: string, assignee_role: string, due_days: number }
```

Items stored as JSONB array in `onboarding_templates.items`. When starting onboarding for an employee, tasks are created in bulk from template.

---

### 17.2 Training & Certifications (`Training.tsx`)

Route: `/training`

#### Features

- Track courses: name, provider, hours, completion date
- Certification types: `food_handler` | `fire_safety` | `first_aid` | `labor_safety` | `other`
- Expiry date tracking for renewable certifications
- Certificate URL/file storage
- Filter by employee and cert type

---

### 17.3 Announcements (`Announcements.tsx`)

Route: `/announcements`

#### Features

- Create/edit announcements with title, content, priority (`normal` | `important` | `urgent`)
- Target audience: `all` | specific department | specific store
- Pin announcements to top
- Expiry dates for time-limited announcements
- Read tracking via `announcement_reads` table
- Dashboard integration — announcements displayed on main Dashboard

---

### 17.4 Disciplinary Records (`Disciplinary.tsx`)

Route: `/disciplinary`

#### Record Types

| Type | Category |
|------|----------|
| `verbal_warning` | Discipline |
| `written_warning` | Discipline |
| `suspension` | Discipline |
| `demerit` | Discipline |
| `termination` | Discipline |
| `merit` | Commendation |
| `commendation` | Commendation |

Tracks: employee, issuer, effective date, description. Filterable by employee and type.

---

## 18. Phase 6c — Scheduling Enhancements & Gap Closures

### 18.1 Variable Working Hours (變形工時)

Stores table: `working_hour_type` = `standard` | `2week` | `4week` | `8week`

Supports Taiwan Labor Standards Act §30-32 variable working hour arrangements. Under 4-week variable hours, daily limit extends to 10h without overtime.

### 18.2 Open Shift Marketplace

Extended `shift_swap_requests` with `bid_user_id`, `bid_message`, `bid_at`. Employees can bid on posted open shifts after cancellations or sick calls.

### 18.3 Schedule Template Library

New table `schedule_templates` — save and reuse recurring schedule patterns (e.g., "Holiday weekend crew"). Stores assignments as JSONB.

### 18.4 Labor Cost Budgeting

- `schedules.labor_budget` — max allowed weekly labor cost
- `schedules.budget_alert_threshold` — alert percentage (default 90%)
- `stores.default_labor_budget` — store-level default
- `stores.hourly_rate_default` — baseline hourly rate (NT$183)

### 18.5 Employee Skills & Certification Tagging

Table: `employee_skills` — skill_name, proficiency (basic/intermediate/advanced), certified_at, expires_at. UNIQUE per user+skill.

`shift_templates.required_skills` — TEXT[] array for skill-based shift matching.

### 18.6 Employee Numbers

Auto-generated `users.employee_number` (format: `EMP-001`). Backfilled for existing employees ordered by hire date.

### 18.7 Multi-Level Approval Chains

Table: `approval_chains` — module (leave/overtime/expense), level, approver_role, min_days, min_amount. Enables tiered approvals (e.g., leave ≥3 days requires director approval).

### 18.8 Foreign Worker Tracking

`users.work_permit_number` + `users.work_permit_expiry` — permit expiry validation in leave/scheduling workflows.

### 18.9 Payroll Supplements

`payroll_records.supplementary_nhi` — supplementary NHI premium.
`payroll_records.leave_buyout` — leave buyout amount.

### 18.10 Scheduling KPIs

Table: `scheduling_kpis` — tracks per-store, per-week metrics:
- `ai_generated`, `manual_edits`, `violations_at_publish`
- `acceptance_rate`, `avg_preference_score`, `avg_consistency_score`
- `total_ot_hours`, `labor_cost`, `total_hours`, `employee_count`

---

## 19. Phase 6d — Tiered Summaries & LLM Cost Tracking

### 19.1 Tiered LINE Summary System

Automated AI-powered summarization pipeline for LINE group chats.

#### Summary Tiers

| Tier | Schedule (Taipei) | Input | Output Table |
|------|-------------------|-------|-------------|
| Daily | 7:00 AM daily | Raw `line_messages` (24h window) | `line_daily_summaries` |
| Weekly | Monday 7:00 AM | Daily summaries (Mon–Sun) | `line_weekly_summaries` |
| Monthly | 1st of month 8:30 AM | Weekly summaries | `line_monthly_summaries` |

#### Weekly/Monthly Summary Fields

| Field | Weekly | Monthly |
|-------|--------|---------|
| `summary_text` | Yes | Yes |
| `key_decisions[]` | Yes | Yes |
| `action_items[]` | Yes | Yes |
| `recurring_topics[]` | Yes | Yes |
| `notable_events[]` | No | Yes |
| `message_count` | Yes | Yes |
| `unique_users` | Yes | Yes |

#### Edge Function: `summarize-history`

LLM fallback chain: **Qwen 3.5-Plus** → **Gemini 2.5-Flash** → **Claude Sonnet 4.6**

Each provider failure logs to `llm_usage_logs` before trying the next.

#### Data Pruning

Automated on the 2nd of each month (10:00 AM Taipei):
- Deletes `line_messages` > 90 days old (only if monthly summary exists)
- Deletes `line_daily_summaries` > 90 days old (only if monthly summary exists)
- Weekly/monthly summaries preserved indefinitely as audit trail

---

### 19.2 LLM Usage Tracking

Shared module: `supabase/functions/_shared/llm-logger.ts`

#### Cost Rates (USD per 1M tokens)

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| DashScope | Qwen 3.5-Plus | $0.30 | $0.60 |
| Google | Gemini 2.5-Flash | $0.15 | $0.60 |
| Anthropic | Claude Sonnet 4.6 | $3.00 | $15.00 |
| Anthropic | Claude Opus 4.6 | $15.00 | $75.00 |

#### Logged Fields (`llm_usage_logs` table)

function_name, provider, model, input_tokens, output_tokens, total_tokens, estimated_cost, latency_ms, status (success/error/fallback), error_message, purpose, metadata (JSONB).

Indexed by: created_at DESC, function_name, provider.

---

### 19.3 Permission Improvements

#### Minimum Admin Safety

Database trigger `check_minimum_admin()` fires BEFORE DELETE on `user_roles`:
- Prevents removal of the last active admin
- Raises error if deletion would leave zero active admins

#### Access Level Column

`module_access.access_level` — `'full'` (read+write) or `'read'` (view-only). Checked via `canWrite()` in `permissions.ts`.

#### AdminSettings Integration

Admin Settings page now exposes access level toggle per module with audit logging of all permission changes.

---

## 20. Deployment

### Docker (Production Build)

The admin panel uses a multi-stage Docker build:

```
admin/
├── Dockerfile       # Node 20 Alpine → Nginx Alpine
├── nginx.conf       # SPA routing + static asset caching
└── .dockerignore    # Excludes node_modules, dist, .git
```

**Build & run:**
```bash
cd admin
docker build -t hrm-admin .
docker run -p 8080:8080 hrm-admin
```

**Dockerfile stages:**
1. `node:20-alpine` — installs dependencies (`npm ci`), runs `npm run build`
2. `nginx:alpine` — copies `dist/` to `/usr/share/nginx/html`, applies `nginx.conf`

**Nginx config:**
- Listens on port `8080` (Cloud Run compatible)
- SPA fallback: `try_files $uri $uri/ /index.html` for client-side routing
- LIFF static HTML served directly: `location ~ ^/liff-.+\.html$`
- Static assets cached with `expires max`

### Supabase Edge Functions

```bash
# Deploy all functions
npx supabase functions deploy --project-ref <ref>

# Deploy specific functions
npx supabase functions deploy orchestrator help-chatbot doc-flow-analyzer doc-content-gen doc-indexer --project-ref <ref>

# Set secrets
npx supabase secrets set DASHSCOPE_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=...
```

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | `admin/.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `admin/.env` | Supabase publishable anon key |
| `DASHSCOPE_API_KEY` | Supabase secrets | DashScope Qwen API access |
| `ANTHROPIC_API_KEY` | Supabase secrets | Claude API access (orchestrator, chatbot) |
| `GEMINI_API_KEY` | Supabase secrets | Gemini fallback API access |
| `LINE_CHANNEL_ACCESS_TOKEN` | Supabase secrets | LINE Messaging API |
| `LINE_CHANNEL_SECRET` | Supabase secrets | LINE webhook signature verification |

### Documentation Pipeline

```bash
# Regenerate all 19 help articles
node admin/scripts/generate-docs.mjs
```

Runs locally (bypasses 60s edge function timeout). Calls `doc-flow-analyzer` → `doc-content-gen` → `doc-indexer` in batches of 5.

---

## 21. Related Documentation

| Document | Path | Content |
|----------|------|---------|
| Design System | `admin/design.md` | "The Executive Insight" — color tokens, typography, components, spacing |
| Scheduling AI PRD | `admin/docs/PRD-scheduling-ai.md` | Full PRD for AI auto-scheduler edge function |
| Project Expansion | `project_expansion.md` | Strategic & low-priority gaps for future phases |
| Agent Orchestrator | `project.md` | Multi-agent team architecture and collaboration protocol |
| Insurance Brackets | `.claude/projects/.../memory/taiwan_insurance_brackets.md` | Taiwan labor/health insurance bracket tables (2020–2026) |
